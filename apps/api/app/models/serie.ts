import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { TipoDocumento } from '#constants/sunat'

export default class Serie extends BaseModel {
  static table = 'series'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare empresaId: number

  @column()
  declare sucursalId: number | null

  @column()
  declare tipoDocumento: TipoDocumento

  @column()
  declare serie: string

  @column()
  declare sunatSerieId: number | null

  @column()
  declare activo: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null
}
