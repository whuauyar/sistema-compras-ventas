import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import { SunatGateway } from '#integrations/sunat/sunat_service'
import { SunatApiError } from '#integrations/sunat/sunat_errors'
import { ReglaNegocioError } from '#exceptions/regla_negocio_error'
import { ESTADOS_EN_PROCESO, TIPO_DOCUMENTO, type TipoDocumento } from '#constants/sunat'
import {
  calcularTotales,
  normalizarEstadoSunat,
  validarComprobanteVenta,
  type ClienteComprobante,
  type Cuota,
  type ItemComprobante,
} from '#domain/reglas_comprobante'
import { encolar } from '#services/cola_service'
import Comprobante from '#models/comprobante'
import Empresa from '#models/empresa'
import Serie from '#models/serie'

export interface DatosEmisionVenta {
  tipoDocumento: typeof TIPO_DOCUMENTO.FACTURA | typeof TIPO_DOCUMENTO.BOLETA
  serie?: string
  sucursalId?: number
  fechaEmision?: string
  moneda: 'PEN' | 'USD'
  formaPago: 'Contado' | 'Credito'
  cuotas?: Cuota[]
  cliente: ClienteComprobante
  items: ItemComprobante[]
  ventaId?: number | null
}

/** Segundos de espera antes de la primera reconsulta de un comprobante en proceso. */
const ESPERA_PRIMERA_RECONSULTA = 60

export class ComprobanteService {
  /**
   * Emite una factura o boleta:
   * 1) valida reglas fiscales localmente, 2) guarda un borrador local con uuid,
   * 3) envía a la API con Idempotency-Key = uuid, 4) refleja el estado SUNAT devuelto.
   * Ante caída de red/5xx el comprobante queda en `error_envio` y se reintenta en segundo plano.
   */
  /**
   * Valida serie y reglas fiscales SIN efectos (ni BD ni API). Lo usa la venta antes de mover stock,
   * para que un error fiscal no deje una venta a medias.
   */
  async validarVenta(empresa: Empresa, datos: DatosEmisionVenta) {
    const serie = await this.resolverSerie(
      empresa.id,
      datos.tipoDocumento,
      datos.serie,
      datos.sucursalId
    )
    const errores = validarComprobanteVenta({
      tipoDocumento: datos.tipoDocumento,
      serie: serie.serie,
      regimen: empresa.regimen,
      cliente: datos.cliente,
      items: datos.items,
      formaPago: datos.formaPago,
      cuotas: datos.cuotas,
      igvTasa: empresa.igvTasa,
    })
    if (errores.length > 0) throw new ReglaNegocioError('El comprobante tiene errores.', errores)
    return { serie, totales: calcularTotales(datos.items, empresa.igvTasa) }
  }

  async emitirVenta(
    empresa: Empresa,
    usuarioId: number,
    datos: DatosEmisionVenta
  ): Promise<Comprobante> {
    const { serie } = await this.validarVenta(empresa, datos)

    const totales = calcularTotales(datos.items, empresa.igvTasa)
    const fechaEmision = datos.fechaEmision ?? DateTime.now().setZone('America/Lima').toISODate()!

    const payload: Record<string, unknown> = {
      serie: serie.serie,
      fecha_emision: fechaEmision,
      tipo_moneda: datos.moneda,
      forma_pago: datos.formaPago,
      cliente: datos.cliente,
      items: datos.items,
      enviar_automatico: true,
    }
    if (datos.tipoDocumento === TIPO_DOCUMENTO.FACTURA) payload.tipo_operacion = '0101'
    if (datos.formaPago === 'Credito') payload.cuotas = datos.cuotas

    const comprobante = await Comprobante.create({
      uuid: randomUUID(),
      empresaId: empresa.id,
      sucursalId: serie.sucursalId,
      ventaId: datos.ventaId ?? null,
      tipoDocumento: datos.tipoDocumento,
      serie: serie.serie,
      fechaEmision: DateTime.fromISO(fechaEmision),
      moneda: datos.moneda,
      formaPago: datos.formaPago,
      clienteTipoDoc: datos.cliente.tipo_doc,
      clienteNumDoc: datos.cliente.num_doc,
      clienteRazonSocial: datos.cliente.razon_social,
      totalGravadas: totales.gravadas,
      totalIgv: totales.igv,
      total: totales.total,
      sunatEstado: 'borrador',
      payload,
      createdBy: usuarioId,
    })

    return this.enviar(empresa, comprobante)
  }

  /** Envía (o reenvía tras caída) el payload guardado. Idempotente gracias al uuid. */
  async enviar(empresa: Empresa, comprobante: Comprobante): Promise<Comprobante> {
    try {
      const datos = await SunatGateway.cliente().emitir(
        empresa.credenciales(),
        comprobante.tipoDocumento,
        comprobante.payload,
        comprobante.uuid
      )
      await this.aplicarRespuesta(comprobante, datos)
    } catch (error) {
      if (error instanceof SunatApiError && error.esReintentable) {
        comprobante.sunatEstado = 'error_envio'
        comprobante.sunatDescripcion = `${error.message} Se reintentará automáticamente.`
        await comprobante.save()
        await encolar(
          'sunat.enviar',
          { comprobanteId: comprobante.id },
          { empresaId: empresa.id, retrasoSeg: 30 }
        )
        return comprobante
      }
      // Error de validación de la API: no se creó nada allá, se descarta el borrador local
      if (comprobante.sunatEstado === 'borrador') await comprobante.delete()
      throw error
    }

    if (ESTADOS_EN_PROCESO.includes(comprobante.sunatEstado)) {
      await encolar(
        'sunat.reconsultar',
        { comprobanteId: comprobante.id },
        { empresaId: empresa.id, retrasoSeg: ESPERA_PRIMERA_RECONSULTA }
      )
    }
    return comprobante
  }

  /** Consulta el estado actual en la API (o reintenta el envío si nunca llegó). */
  async reconsultar(empresa: Empresa, comprobante: Comprobante): Promise<Comprobante> {
    if (!comprobante.sunatApiId) return this.enviar(empresa, comprobante)
    const datos = await SunatGateway.cliente().obtenerComprobante(
      empresa.credenciales(),
      comprobante.tipoDocumento,
      comprobante.sunatApiId
    )
    await this.aplicarRespuesta(comprobante, datos)
    return comprobante
  }

  /** Reenvía a SUNAT un comprobante pendiente o rechazado (POST /{tipo}/{id}/reenviar). */
  async reenviar(empresa: Empresa, comprobante: Comprobante): Promise<Comprobante> {
    if (!comprobante.sunatApiId) return this.enviar(empresa, comprobante)
    if (comprobante.sunatEstado === 'aceptado' || comprobante.sunatEstado === 'anulado') {
      throw new ReglaNegocioError(
        'El comprobante ya fue procesado por SUNAT; no se puede reenviar.'
      )
    }
    const datos = await SunatGateway.cliente().reenviar(
      empresa.credenciales(),
      comprobante.tipoDocumento,
      comprobante.sunatApiId
    )
    await this.aplicarRespuesta(comprobante, datos)
    return comprobante
  }

  /** Copia al registro local los datos fiscales devueltos por la API. */
  async aplicarRespuesta(comprobante: Comprobante, datos: Record<string, any>) {
    const estadoAnterior = comprobante.sunatEstado
    const sunat = datos?.sunat ?? {}
    const totales = datos?.totales ?? {}
    comprobante.merge({
      sunatApiId: datos?.id ?? comprobante.sunatApiId,
      correlativo: datos?.correlativo ?? comprobante.correlativo,
      numeroCompleto: datos?.numero_completo ?? comprobante.numeroCompleto,
      totalGravadas: totales.gravadas ?? comprobante.totalGravadas,
      totalIgv: totales.igv ?? comprobante.totalIgv,
      total: totales.total ?? comprobante.total,
      sunatEstado: normalizarEstadoSunat(sunat.estado),
      sunatCodigo:
        sunat.codigo === undefined || sunat.codigo === null ? null : String(sunat.codigo),
      sunatDescripcion: sunat.descripcion ?? null,
      sunatNotas: sunat.notas ?? null,
      hashCpe: sunat.hash_cpe ?? comprobante.hashCpe,
      ultimaRespuesta: datos,
      sunatConsultadoEn: DateTime.now(),
      sunatEnviadoEn: comprobante.sunatEnviadoEn ?? (datos?.id ? DateTime.now() : null),
    })
    await comprobante.save()
    if (estadoAnterior !== comprobante.sunatEstado) {
      // Import diferido para evitar dependencia circular (efectos → ventas → comprobantes)
      const { aplicarEfectos } = await import('#services/efectos_comprobante')
      await aplicarEfectos(comprobante)
    }
  }

  async resolverSerie(
    empresaId: number,
    tipo: TipoDocumento,
    serie?: string,
    sucursalId?: number
  ): Promise<Serie> {
    const consulta = Serie.query().where({ empresaId, tipoDocumento: tipo, activo: true })
    if (serie) consulta.where('serie', serie)
    if (sucursalId) consulta.where('sucursal_id', sucursalId)
    const encontrada = await consulta.orderBy('serie').first()
    if (!encontrada) {
      throw new ReglaNegocioError('No hay una serie activa para este comprobante.', [
        { campo: 'serie', mensaje: 'Configure la serie en Configuración > Series.' },
      ])
    }
    return encontrada
  }
}
