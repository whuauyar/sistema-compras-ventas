import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { aNumero } from '#models/columnas'
import OrdenCompraItem from '#models/orden_compra_item'
import Proveedor from '#models/proveedor'

export default class OrdenCompra extends BaseModel {
  static table = 'ordenes_compra'

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
  declare numero: number

  @column.date()
  declare fecha: DateTime

  @column.date()
  declare fechaEntrega: DateTime | null

  @column()
  declare moneda: string

  @column()
  declare estado: string

  @column()
  declare observacion: string | null

  @column({ consume: aNumero })
  declare totalGravadas: number

  @column({ consume: aNumero })
  declare totalIgv: number

  @column({ consume: aNumero })
  declare total: number

  @column()
  declare createdBy: number | null

  @column()
  declare aprobadoBy: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @hasMany(() => OrdenCompraItem, { foreignKey: 'ordenCompraId' })
  declare items: HasMany<typeof OrdenCompraItem>

  @belongsTo(() => Proveedor)
  declare proveedor: BelongsTo<typeof Proveedor>
}
