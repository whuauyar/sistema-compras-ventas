import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import AjusteInventarioItem from '#models/ajuste_inventario_item'

export default class AjusteInventario extends BaseModel {
  static table = 'ajustes_inventario'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare empresaId: number

  @column()
  declare almacenId: number

  @column()
  declare tipo: string

  @column()
  declare motivo: string

  @column()
  declare observacion: string | null

  @column.dateTime()
  declare fecha: DateTime

  @column()
  declare createdBy: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @hasMany(() => AjusteInventarioItem, { foreignKey: 'ajusteId' })
  declare items: HasMany<typeof AjusteInventarioItem>
}
