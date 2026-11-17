import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { FormatoImpresion } from '#constants/sunat'

export default class Caja extends BaseModel {
  static table = 'cajas'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare empresaId: number

  @column()
  declare sucursalId: number

  @column()
  declare nombre: string

  @column()
  declare formatoImpresion: FormatoImpresion | null

  @column()
  declare activo: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null
}
