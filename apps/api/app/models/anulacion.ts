import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Anulacion extends BaseModel {
  static table = 'anulaciones'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare empresaId: number

  @column()
  declare tipo: string

  @column()
  declare sunatApiId: number

  @column()
  declare identificador: string | null

  @column.date()
  declare fecha: DateTime

  @column()
  declare motivo: string

  @column()
  declare estado: string

  @column()
  declare sunatDescripcion: string | null

  @column()
  declare comprobanteIds: number[]

  @column()
  declare ultimaRespuesta: unknown

  @column()
  declare createdBy: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null
}
