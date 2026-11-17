import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Job extends BaseModel {
  static table = 'jobs'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare tipo: string

  @column()
  declare payload: Record<string, unknown>

  @column()
  declare empresaId: number | null

  @column()
  declare estado: 'pendiente' | 'procesando' | 'completado' | 'fallido'

  @column()
  declare intentos: number

  @column()
  declare maxIntentos: number

  @column.dateTime()
  declare disponibleEn: DateTime

  @column()
  declare ultimoError: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null
}
