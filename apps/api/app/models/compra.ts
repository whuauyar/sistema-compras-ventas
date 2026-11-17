import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { aNumero } from '#models/columnas'
import CompraItem from '#models/compra_item'
import CuentaPagar from '#models/cuenta_pagar'
import Proveedor from '#models/proveedor'

export default class Compra extends BaseModel {
  static table = 'compras'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare empresaId: number

  @column()
  declare sucursalId: number

  @column()
  declare almacenId: number

  @column()
  declare proveedorId: number

  @column()
  declare ordenCompraId: number | null

  @column()
  declare tipoDocumento: string

  @column()
  declare serie: string

  @column()
  declare numero: string

  @column.date()
  declare fechaEmision: DateTime

  @column()
  declare moneda: string

  @column({ consume: aNumero })
  declare tipoCambio: number

  @column()
  declare formaPago: string

  @column({ consume: aNumero })
  declare totalGravadas: number

  @column({ consume: aNumero })
  declare totalExoneradas: number

  @column({ consume: aNumero })
  declare totalInafectas: number

  @column({ consume: aNumero })
  declare totalIgv: number

  @column({ consume: aNumero })
  declare total: number

  @column()
  declare estado: string

  @column()
  declare observacion: string | null

  @column()
  declare createdBy: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @hasMany(() => CompraItem, { foreignKey: 'compraId' })
  declare items: HasMany<typeof CompraItem>

  @belongsTo(() => Proveedor)
  declare proveedor: BelongsTo<typeof Proveedor>

  @hasMany(() => CuentaPagar, { foreignKey: 'compraId' })
  declare cuotas: HasMany<typeof CuentaPagar>
}
