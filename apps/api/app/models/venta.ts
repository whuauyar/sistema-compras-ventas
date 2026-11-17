import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { aNumero } from '#models/columnas'
import Comprobante from '#models/comprobante'
import CuentaCobrar from '#models/cuenta_cobrar'
import VentaItem from '#models/venta_item'
import VentaPago from '#models/venta_pago'

export default class Venta extends BaseModel {
  static table = 'ventas'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare empresaId: number

  @column()
  declare sucursalId: number

  @column()
  declare almacenId: number

  @column()
  declare cajaId: number | null

  @column()
  declare aperturaCajaId: number | null

  @column()
  declare clienteId: number | null

  @column()
  declare clienteTipoDoc: string

  @column()
  declare clienteNumDoc: string

  @column()
  declare clienteRazonSocial: string

  @column()
  declare clienteDireccion: string | null

  @column()
  declare tipoDocumento: string

  @column.date()
  declare fecha: DateTime

  @column()
  declare moneda: string

  @column()
  declare formaPago: string

  @column({ consume: aNumero })
  declare totalGravadas: number

  @column({ consume: aNumero })
  declare totalIgv: number

  @column({ consume: aNumero })
  declare totalDescuentos: number

  @column({ consume: aNumero })
  declare total: number

  @column({ consume: aNumero })
  declare costoTotal: number

  @column({ consume: aNumero })
  declare vuelto: number

  @column()
  declare estado: string

  @column()
  declare comprobanteId: number | null

  @column()
  declare createdBy: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @hasMany(() => VentaItem, { foreignKey: 'ventaId' })
  declare items: HasMany<typeof VentaItem>

  @hasMany(() => VentaPago, { foreignKey: 'ventaId' })
  declare pagos: HasMany<typeof VentaPago>

  @hasMany(() => CuentaCobrar, { foreignKey: 'ventaId' })
  declare cuotas: HasMany<typeof CuentaCobrar>

  @belongsTo(() => Comprobante)
  declare comprobante: BelongsTo<typeof Comprobante>
}
