import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import { ReglaNegocioError } from '#exceptions/regla_negocio_error'
import { SunatGateway } from '#integrations/sunat/sunat_service'
import { ComprobanteService } from '#services/comprobante_service'
import { encolar } from '#services/cola_service'
import Anulacion from '#models/anulacion'
import Comprobante from '#models/comprobante'
import Empresa from '#models/empresa'

/** Plazo de SUNAT para comunicar bajas o anular boletas por resumen. */
export const DIAS_PLAZO_ANULACION = 7

const normalizarEstado = (datos: Record<string, any>): Anulacion['estado'] => {
  const valor = String(
    datos?.estado_sunat ?? datos?.estado ?? datos?.sunat?.estado ?? 'enviado'
  ).toLowerCase()
  return (
    (['enviado', 'pendiente', 'aceptado', 'rechazado'] as const).find((e) => e === valor) ??
    'enviado'
  )
}

export class AnulacionService {
  private comprobantes = new ComprobanteService()

  /**
   * Anula comprobantes ACEPTADOS de una misma fecha de emisión:
   * - facturas, NC y ND → comunicación de baja (POST /anulaciones)
   * - boletas → resumen diario en modo anulación (POST /resumenes con anular[])
   * No se pueden mezclar boletas con los demás en una misma solicitud.
   */
  async anular(empresa: Empresa, usuarioId: number, comprobanteIds: number[], motivo: string) {
    const docs = await Comprobante.query()
      .where('empresa_id', empresa.id)
      .whereIn('id', comprobanteIds)
    if (docs.length !== new Set(comprobanteIds).size)
      throw new ReglaNegocioError('Hay comprobantes que no existen.')

    const errores: Array<{ campo: string; mensaje: string }> = []
    const esResumen = docs.every((d) => d.tipoDocumento === '03')
    if (!esResumen && docs.some((d) => d.tipoDocumento === '03')) {
      errores.push({
        campo: 'comprobante_ids',
        mensaje: 'Las boletas se anulan por resumen diario; no las mezcle con facturas o notas.',
      })
    }
    const fechas = new Set(docs.map((d) => d.fechaEmision.toISODate()))
    if (fechas.size > 1)
      errores.push({
        campo: 'comprobante_ids',
        mensaje: 'Todos los comprobantes deben tener la misma fecha de emisión.',
      })

    const limite = DateTime.now()
      .setZone('America/Lima')
      .startOf('day')
      .minus({ days: DIAS_PLAZO_ANULACION })
    for (const d of docs) {
      const nombre = d.numeroCompleto ?? `#${d.id}`
      if (!['01', '03', '07', '08'].includes(d.tipoDocumento))
        errores.push({ campo: 'comprobante_ids', mensaje: `${nombre}: tipo no anulable.` })
      if (d.sunatEstado !== 'aceptado')
        errores.push({
          campo: 'comprobante_ids',
          mensaje: `${nombre}: debe estar aceptado (está ${d.sunatEstado}).`,
        })
      if (d.fechaEmision < limite)
        errores.push({
          campo: 'comprobante_ids',
          mensaje: `${nombre}: pasó el plazo de ${DIAS_PLAZO_ANULACION} días; emita una nota de crédito.`,
        })
      if (d.tipoDocumento === '01') {
        const conNota = await Comprobante.query()
          .where({ docReferenciaId: d.id, tipoDocumento: '07' })
          .whereNotIn('sunat_estado', ['rechazado', 'anulado'])
          .first()
        if (conNota)
          errores.push({
            campo: 'comprobante_ids',
            mensaje: `${nombre}: tiene nota de crédito; anule primero la nota.`,
          })
      }
    }
    if (errores.length) throw new ReglaNegocioError('No se puede anular.', errores)

    const fecha = docs[0].fechaEmision.toISODate()!
    const cliente = SunatGateway.cliente()
    const cred = empresa.credenciales()
    const clave = randomUUID()
    const respuesta = esResumen
      ? await cliente.resumenDiario(
          cred,
          {
            fecha_resumen: fecha,
            anular: docs.map((d) => ({ id: d.sunatApiId, motivo })),
            enviar_automatico: true,
          },
          clave
        )
      : await cliente.comunicarBaja(
          cred,
          {
            fecha_generacion: fecha,
            detalles: docs.map((d) => ({
              tipo_documento: d.tipoDocumento,
              serie: d.serie,
              correlativo: d.correlativo,
              motivo,
            })),
            enviar_automatico: true,
          },
          clave
        )

    const anulacion = await Anulacion.create({
      empresaId: empresa.id,
      tipo: esResumen ? 'resumen' : 'baja',
      sunatApiId: Number(respuesta.id_resumen ?? respuesta.id_anulacion ?? respuesta.id),
      identificador: respuesta.identifier ?? null,
      fecha: DateTime.fromISO(fecha),
      motivo,
      estado: normalizarEstado(respuesta),
      comprobanteIds: docs.map((d) => d.id),
      ultimaRespuesta: respuesta,
      createdBy: usuarioId,
    })
    await Comprobante.query()
      .whereIn('id', anulacion.comprobanteIds)
      .update({ sunat_estado: 'anulacion_en_proceso' })
    await encolar(
      'sunat.anulacion',
      { anulacionId: anulacion.id },
      { empresaId: empresa.id, retrasoSeg: 60 }
    )
    return anulacion
  }

  /**
   * Consulta el ticket en SUNAT. Aceptado → los comprobantes quedan anulados (y sus ventas se revierten).
   * Rechazado → vuelven a "aceptado".
   */
  async consultar(empresa: Empresa, anulacion: Anulacion) {
    if (anulacion.estado === 'aceptado' || anulacion.estado === 'rechazado') return anulacion
    const datos = await SunatGateway.cliente().estadoAnulacion(
      empresa.credenciales(),
      anulacion.tipo as 'baja' | 'resumen',
      anulacion.sunatApiId
    )
    anulacion.merge({
      estado: normalizarEstado(datos),
      sunatDescripcion: datos?.descripcion ?? datos?.mensaje ?? null,
      ultimaRespuesta: datos,
    })
    await anulacion.save()

    if (anulacion.estado === 'aceptado' || anulacion.estado === 'rechazado') {
      const docs = await Comprobante.query().whereIn('id', anulacion.comprobanteIds)
      for (const doc of docs) {
        // Se refleja el estado final con los efectos locales (revertir venta si se anuló)
        await this.comprobantes.aplicarRespuesta(doc, {
          ...(doc.ultimaRespuesta as Record<string, any>),
          sunat: {
            ...((doc.ultimaRespuesta as any)?.sunat ?? {}),
            estado: anulacion.estado === 'aceptado' ? 'anulado' : 'aceptado',
          },
        })
      }
    }
    return anulacion
  }
}
