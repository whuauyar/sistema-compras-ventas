import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Almacen extends BaseModel {
  static table = 'almacenes'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare empresaId: number

  @column()
  declare sucursalId: number

  @column()
  declare nombre: string

  @column()
  declare activo: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null
}
