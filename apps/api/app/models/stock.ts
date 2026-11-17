import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { aNumero } from '#models/columnas'
import Almacen from '#models/almacen'
import Producto from '#models/producto'

export default class Stock extends BaseModel {
  static table = 'stock'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare empresaId: number

  @column()
  declare almacenId: number

  @column()
  declare productoId: number

  @column({ consume: aNumero })
  declare cantidad: number

  @column({ consume: aNumero })
  declare costoPromedio: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => Producto)
  declare producto: BelongsTo<typeof Producto>

  @belongsTo(() => Almacen)
  declare almacen: BelongsTo<typeof Almacen>
}
