import { DateTime } from 'luxon'
import { aJson, aNumero } from '#models/columnas'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { EstadoSunat, TipoDocumento } from '#constants/sunat'

/** Espejo local del comprobante emitido en la API SUNAT (la API es la fuente de verdad fiscal). */
export default class Comprobante extends BaseModel {
  static table = 'comprobantes'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare uuid: string

  @column()
  declare empresaId: number

  @column()
  declare sucursalId: number | null

  @column()
  declare ventaId: number | null

  @column()
  declare docReferenciaId: number | null

  @column()
  declare tipoDocumento: TipoDocumento

  @column()
  declare serie: string

  @column()
  declare correlativo: number | null

  @column()
  declare numeroCompleto: string | null

  @column.date()
  declare fechaEmision: DateTime

  @column()
  declare moneda: string

  @column()
  declare formaPago: string

  @column()
  declare clienteTipoDoc: string

  @column()
  declare clienteNumDoc: string

  @column()
  declare clienteRazonSocial: string

  @column({ consume: aNumero })
  declare totalGravadas: number

  @column({ consume: aNumero })
  declare totalIgv: number

  @column({ consume: aNumero })
  declare total: number

  @column()
  declare sunatApiId: number | null

  @column()
  declare sunatEstado: EstadoSunat

  @column()
  declare sunatCodigo: string | null

  @column()
  declare sunatDescripcion: string | null

  @column({ prepare: aJson })
  declare sunatNotas: unknown

  @column()
  declare hashCpe: string | null

  @column({ serializeAs: null, prepare: aJson })
  declare payload: Record<string, unknown>

  @column({ serializeAs: null, prepare: aJson })
  declare ultimaRespuesta: unknown

  @column.dateTime()
  declare sunatConsultadoEn: DateTime | null

  /** Cuando la API SUNAT registró el comprobante (primera respuesta con id). */
  @column.dateTime()
  declare sunatEnviadoEn: DateTime | null

  @column()
  declare codMotivo: string | null

  @column()
  declare desMotivo: string | null

  @column()
  declare reponeStock: boolean

  /** Ítems que devuelve una NC: [{ ventaItemId, productoId, almacenId, cantidad, costoUnitario }] */
  @column({ serializeAs: null, prepare: aJson })
  declare detalleStock: Array<{
    ventaItemId: number
    productoId: number
    almacenId: number
    cantidad: number
    costoUnitario: number
  }> | null

  @column()
  declare stockAplicado: boolean

  @column()
  declare createdBy: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null
}
