import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Proveedor extends BaseModel {
  static table = 'proveedores'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare empresaId: number

  @column()
  declare tipoDoc: string

  @column()
  declare numDoc: string

  @column()
  declare razonSocial: string

  @column()
  declare nombreComercial: string | null

  @column()
  declare direccion: string | null

  @column()
  declare ubigeo: string | null

  @column()
  declare email: string | null

  @column()
  declare telefono: string | null

  @column()
  declare activo: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null
}
