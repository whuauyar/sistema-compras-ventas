import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import { ReglaNegocioError } from '#exceptions/regla_negocio_error'
import { calcularTotales, type ItemComprobante } from '#domain/reglas_comprobante'
import { redondearMonto } from '#domain/kardex'
import { ComprobanteService } from '#services/comprobante_service'
import Comprobante from '#models/comprobante'
import Empresa from '#models/empresa'
import Serie from '#models/serie'
import Venta from '#models/venta'
import VentaItem from '#models/venta_item'

export const MOTIVOS_NC: Record<string, string> = {
  '01': 'Anulación de la operación',
  '02': 'Anulación por error en el RUC',
  '03': 'Corrección por error en la descripción',
  '04': 'Descuento global',
  '05': 'Descuento por ítem',
  '06': 'Devolución total',
  '07': 'Devolución por ítem',
  '08': 'Bonificación',
  '09': 'Disminución en el valor',
}

export const MOTIVOS_ND: Record<string, string> = {
  '01': 'Intereses por mora',
  '02': 'Aumento en el valor',
  '03': 'Penalidades / otros conceptos',
}

/** Motivos de NC que exigen devolver TODO el comprobante. */
const MOTIVOS_TOTALES = new Set(['01', '02', '06'])

export interface DatosNotaCredito {
  codMotivo: string
  desMotivo?: string | null
  /** Ítems a acreditar. Con venta: por ventaItemId. Sin venta: por índice del comprobante. Vacío en motivos totales = todo. */
  items?: Array<{ ventaItemId?: number; indice?: number; cantidad: number }>
  reponerStock?: boolean
}

export interface DatosNotaDebito {
  codMotivo: string
  desMotivo?: string | null
  items: Array<{
    descripcion: string
    unidad?: string
    cantidad: number
    precio_unitario: number
    tip_afe_igv?: string
  }>
}

export interface DatosGuia {
  serie?: string
  ventaId?: number | null
  destinatario: { tipo_doc: '1' | '6'; num_doc: string; razon_social: string }
  codTraslado: string
  modTraslado: '01' | '02'
  fechaTraslado: string
  fechaEntregaTransportista?: string | null
  pesoTotal: number
  numBultos?: number | null
  partida: { ubigeo: string; direccion: string }
  llegada: { ubigeo: string; direccion: string }
  transportista?: {
    tipo_doc: string
    num_doc: string
    razon_social: string
    nro_mtc?: string | null
  } | null
  vehiculo?: { placa: string } | null
  conductor?: {
    tipo_doc: string
    num_doc: string
    licencia: string
    nombres: string
    apellidos: string
  } | null
  items?: Array<{ codigo?: string; descripcion: string; cantidad: number; unidad?: string }>
  observacion?: string | null
}

const hoyLima = () => DateTime.now().setZone('America/Lima').toISODate()!

export class DocumentosService {
  private comprobantes = new ComprobanteService()

  /** Serie de NC/ND cuyo prefijo (F/B) coincide con el documento afectado. */
  private async serieNota(empresaId: number, tipo: '07' | '08', origen: Comprobante) {
    const serie = await Serie.query()
      .where({ empresaId, tipoDocumento: tipo, activo: true })
      .whereLike('serie', `${origen.serie[0]}%`)
      .orderBy('serie')
      .first()
    if (!serie) {
      throw new ReglaNegocioError(
        `No hay serie de ${tipo === '07' ? 'nota de crédito' : 'nota de débito'} para documentos ${origen.serie[0]}.`,
        [
          {
            campo: 'serie',
            mensaje: `Cree una serie ${origen.serie[0]}C01 / ${origen.serie[0]}D01 en Configuración > Series.`,
          },
        ]
      )
    }
    return serie
  }

  private async origen(empresaId: number, comprobanteId: number) {
    const origen = await Comprobante.query().where({ id: comprobanteId, empresaId }).firstOrFail()
    if (!['01', '03'].includes(origen.tipoDocumento)) {
      throw new ReglaNegocioError('Solo se emiten notas sobre facturas o boletas.')
    }
    if (origen.sunatEstado !== 'aceptado') {
      throw new ReglaNegocioError(
        'El comprobante debe estar ACEPTADO por SUNAT para emitirle notas.'
      )
    }
    return origen
  }

  private payloadNota(
    serie: string,
    origen: Comprobante,
    codMotivo: string,
    desMotivo: string,
    items: ItemComprobante[]
  ) {
    return {
      serie,
      fecha_emision: hoyLima(),
      tipo_moneda: origen.moneda,
      cliente: (origen.payload as any).cliente,
      doc_afectado_tipo: origen.tipoDocumento,
      doc_afectado_serie: origen.serie,
      doc_afectado_correlativo: origen.correlativo,
      cod_motivo: codMotivo,
      des_motivo: desMotivo,
      items,
      enviar_automatico: true,
    }
  }

  /**
   * Nota de crédito sobre una factura/boleta aceptada.
   * El stock se repone recién cuando SUNAT ACEPTA la NC (ver efectos_comprobante).
   */
  async notaCredito(
    empresa: Empresa,
    usuarioId: number,
    comprobanteId: number,
    d: DatosNotaCredito
  ) {
    if (!MOTIVOS_NC[d.codMotivo])
      throw new ReglaNegocioError('Motivo de nota de crédito no válido.', [
        { campo: 'cod_motivo', mensaje: 'Catálogo 09.' },
      ])
    const origen = await this.origen(empresa.id, comprobanteId)
    const serie = await this.serieNota(empresa.id, '07', origen)

    // Lo ya acreditado por otras NC vigentes
    const previas = await Comprobante.query()
      .where({ docReferenciaId: origen.id, tipoDocumento: '07' })
      .whereNotIn('sunat_estado', ['rechazado', 'anulado'])
    const acreditado = redondearMonto(previas.reduce((s, n) => s + n.total, 0))

    let items: ItemComprobante[]
    let detalle: NonNullable<Comprobante['detalleStock']> = []
    const total = MOTIVOS_TOTALES.has(d.codMotivo) || !d.items?.length

    if (origen.ventaId) {
      const venta = await Venta.findOrFail(origen.ventaId)
      const ventaItems = await VentaItem.query().where('venta_id', venta.id).orderBy('id')
      const reservado = new Map<number, number>()
      for (const n of previas)
        for (const x of n.detalleStock ?? [])
          reservado.set(x.ventaItemId, (reservado.get(x.ventaItemId) ?? 0) + x.cantidad)

      const pedidos = total
        ? ventaItems
            .map((vi) => ({
              ventaItemId: vi.id,
              cantidad: vi.cantidad - (reservado.get(vi.id) ?? 0),
            }))
            .filter((x) => x.cantidad > 0)
        : d.items!.map((x) => ({ ventaItemId: x.ventaItemId!, cantidad: x.cantidad }))

      items = []
      for (const p of pedidos) {
        const vi = ventaItems.find((v) => v.id === p.ventaItemId)
        if (!vi)
          throw new ReglaNegocioError('Ítem no pertenece a la venta.', [
            { campo: 'items', mensaje: `Ítem ${p.ventaItemId}.` },
          ])
        const disponible = vi.cantidad - (reservado.get(vi.id) ?? 0)
        if (p.cantidad > disponible) {
          throw new ReglaNegocioError(`Cantidad mayor a la disponible en "${vi.descripcion}".`, [
            { campo: 'items', mensaje: `Disponible: ${disponible}.` },
          ])
        }
        items.push({
          codigo: vi.codigo ?? undefined,
          descripcion: vi.descripcion,
          unidad: vi.unidad,
          cantidad: p.cantidad,
          precio_unitario: vi.precioUnitario,
          tip_afe_igv: vi.tipAfeIgv,
        })
        detalle.push({
          ventaItemId: vi.id,
          productoId: vi.productoId,
          almacenId: venta.almacenId,
          cantidad: p.cantidad,
          costoUnitario: vi.costoUnitario,
        })
      }
    } else {
      const originales = ((origen.payload as any).items ?? []) as ItemComprobante[]
      items = total
        ? originales
        : d.items!.map((x) => {
            const it = originales[x.indice ?? -1]
            if (!it)
              throw new ReglaNegocioError('Ítem no válido.', [
                { campo: 'items', mensaje: `Índice ${x.indice}.` },
              ])
            if (x.cantidad > it.cantidad)
              throw new ReglaNegocioError('Cantidad mayor a la del comprobante.')
            return { ...it, cantidad: x.cantidad }
          })
      detalle = []
    }

    if (items.length === 0)
      throw new ReglaNegocioError('No queda nada por acreditar en este comprobante.')
    const totales = calcularTotales(items, empresa.igvTasa)
    if (redondearMonto(acreditado + totales.total) > origen.total) {
      throw new ReglaNegocioError('El importe de la nota supera el saldo del comprobante.', [
        {
          campo: 'items',
          mensaje: `Ya acreditado: ${acreditado}. Total del comprobante: ${origen.total}.`,
        },
      ])
    }

    const desMotivo = d.desMotivo?.trim() || MOTIVOS_NC[d.codMotivo]
    const reponer = Boolean(d.reponerStock) && detalle.length > 0
    const nota = await Comprobante.create({
      uuid: randomUUID(),
      empresaId: empresa.id,
      sucursalId: serie.sucursalId,
      ventaId: origen.ventaId,
      docReferenciaId: origen.id,
      tipoDocumento: '07',
      serie: serie.serie,
      fechaEmision: DateTime.fromISO(hoyLima()),
      moneda: origen.moneda,
      formaPago: 'Contado',
      clienteTipoDoc: origen.clienteTipoDoc,
      clienteNumDoc: origen.clienteNumDoc,
      clienteRazonSocial: origen.clienteRazonSocial,
      totalGravadas: totales.gravadas,
      totalIgv: totales.igv,
      total: totales.total,
      sunatEstado: 'borrador',
      codMotivo: d.codMotivo,
      desMotivo,
      reponeStock: reponer,
      detalleStock: reponer ? detalle : null,
      stockAplicado: false,
      payload: this.payloadNota(serie.serie, origen, d.codMotivo, desMotivo, items),
      createdBy: usuarioId,
    })
    return this.comprobantes.enviar(empresa, nota)
  }

  /** Nota de débito (intereses, penalidades, aumento de valor) sobre una factura/boleta aceptada. */
  async notaDebito(empresa: Empresa, usuarioId: number, comprobanteId: number, d: DatosNotaDebito) {
    if (!MOTIVOS_ND[d.codMotivo])
      throw new ReglaNegocioError('Motivo de nota de débito no válido.', [
        { campo: 'cod_motivo', mensaje: 'Catálogo 10.' },
      ])
    const origen = await this.origen(empresa.id, comprobanteId)
    const serie = await this.serieNota(empresa.id, '08', origen)
    const items: ItemComprobante[] = d.items.map((i) => ({
      descripcion: i.descripcion,
      unidad: i.unidad ?? 'ZZ',
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario,
      tip_afe_igv: i.tip_afe_igv ?? '10',
    }))
    const totales = calcularTotales(items, empresa.igvTasa)
    const desMotivo = d.desMotivo?.trim() || MOTIVOS_ND[d.codMotivo]
    const nota = await Comprobante.create({
      uuid: randomUUID(),
      empresaId: empresa.id,
      sucursalId: serie.sucursalId,
      ventaId: origen.ventaId,
      docReferenciaId: origen.id,
      tipoDocumento: '08',
      serie: serie.serie,
      fechaEmision: DateTime.fromISO(hoyLima()),
      moneda: origen.moneda,
      formaPago: 'Contado',
      clienteTipoDoc: origen.clienteTipoDoc,
      clienteNumDoc: origen.clienteNumDoc,
      clienteRazonSocial: origen.clienteRazonSocial,
      totalGravadas: totales.gravadas,
      totalIgv: totales.igv,
      total: totales.total,
      sunatEstado: 'borrador',
      codMotivo: d.codMotivo,
      desMotivo,
      reponeStock: false,
      stockAplicado: false,
      payload: this.payloadNota(serie.serie, origen, d.codMotivo, desMotivo, items),
      createdBy: usuarioId,
    })
    return this.comprobantes.enviar(empresa, nota)
  }

  /** Guía de remisión remitente (09). Exige credenciales GRE configuradas en la empresa. */
  async guiaRemision(empresa: Empresa, usuarioId: number, d: DatosGuia) {
    if (!empresa.greConfigurada) {
      throw new ReglaNegocioError(
        'La empresa no tiene credenciales GRE (client_id/client_secret). SUNAT rechazaría la guía.',
        [{ campo: 'gre', mensaje: 'Configure las credenciales GRE en el servicio de facturación.' }]
      )
    }
    const errores: Array<{ campo: string; mensaje: string }> = []
    if (d.modTraslado === '01') {
      if (!d.transportista)
        errores.push({
          campo: 'transportista',
          mensaje: 'El transporte público requiere transportista.',
        })
      else if (d.transportista.num_doc === empresa.ruc)
        errores.push({
          campo: 'transportista.num_doc',
          mensaje: 'El transportista no puede ser el mismo emisor.',
        })
      if (!d.fechaEntregaTransportista)
        errores.push({
          campo: 'fecha_entrega_transportista',
          mensaje: 'Indique la fecha de entrega al transportista.',
        })
    } else {
      if (!d.vehiculo?.placa)
        errores.push({
          campo: 'vehiculo.placa',
          mensaje: 'El transporte privado requiere la placa.',
        })
      if (!d.conductor)
        errores.push({
          campo: 'conductor',
          mensaje: 'El transporte privado requiere un conductor.',
        })
    }

    let items = d.items ?? []
    let venta: Venta | null = null
    if (d.ventaId) {
      venta = await Venta.query().where({ id: d.ventaId, empresaId: empresa.id }).firstOrFail()
      if (items.length === 0) {
        const vi = await VentaItem.query().where('venta_id', venta.id)
        items = vi
          .filter((i) => i.unidad !== 'ZZ')
          .map((i) => ({
            codigo: i.codigo ?? undefined,
            descripcion: i.descripcion,
            cantidad: i.cantidad,
            unidad: i.unidad,
          }))
      }
    }
    if (items.length === 0)
      errores.push({ campo: 'items', mensaje: 'La guía debe tener al menos un bien.' })
    if (errores.length) throw new ReglaNegocioError('La guía tiene errores.', errores)

    const serie = await this.comprobantes.resolverSerie(empresa.id, '09', d.serie)
    const payload: Record<string, unknown> = {
      serie: serie.serie,
      fecha_emision: hoyLima(),
      destinatario: d.destinatario,
      cod_traslado: d.codTraslado,
      mod_traslado: d.modTraslado,
      fecha_traslado: d.fechaTraslado,
      peso_total: d.pesoTotal,
      und_peso_total: 'KGM',
      num_bultos: d.numBultos ?? undefined,
      partida_ubigeo: d.partida.ubigeo,
      partida_direccion: d.partida.direccion,
      llegada_ubigeo: d.llegada.ubigeo,
      llegada_direccion: d.llegada.direccion,
      items: items.map((i) => ({ ...i, unidad: i.unidad ?? 'NIU' })),
      observacion: d.observacion ?? undefined,
    }
    if (d.modTraslado === '01') {
      payload.transportista = d.transportista
      payload.fecha_entrega_transportista = d.fechaEntregaTransportista
    } else {
      payload.vehiculo = d.vehiculo
      payload.conductor = d.conductor
    }

    const guia = await Comprobante.create({
      uuid: randomUUID(),
      empresaId: empresa.id,
      sucursalId: serie.sucursalId,
      ventaId: venta?.id ?? null,
      docReferenciaId: venta?.comprobanteId ?? null,
      tipoDocumento: '09',
      serie: serie.serie,
      fechaEmision: DateTime.fromISO(hoyLima()),
      moneda: 'PEN',
      formaPago: 'Contado',
      clienteTipoDoc: d.destinatario.tipo_doc,
      clienteNumDoc: d.destinatario.num_doc,
      clienteRazonSocial: d.destinatario.razon_social,
      totalGravadas: 0,
      totalIgv: 0,
      total: 0,
      sunatEstado: 'borrador',
      reponeStock: false,
      stockAplicado: false,
      payload,
      createdBy: usuarioId,
    })
    return this.comprobantes.enviar(empresa, guia)
  }
}
