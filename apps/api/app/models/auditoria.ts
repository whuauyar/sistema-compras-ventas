import { DateTime } from 'luxon'
import { aJson } from '#models/columnas'
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

  @column({ prepare: aJson })
  declare antes: unknown

  @column({ prepare: aJson })
  declare despues: unknown

  @column()
  declare ip: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
