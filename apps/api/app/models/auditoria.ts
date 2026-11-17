import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Auditoria extends BaseModel {
  static table = 'auditorias'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare empresaId: number | null

  @column()
  declare usuarioId: number | null

  @column()
  declare accion: string

  @column()
  declare entidad: string

  @column()
  declare entidadId: string | null

  @column()
  declare antes: unknown

  @column()
  declare despues: unknown

  @column()
  declare ip: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
