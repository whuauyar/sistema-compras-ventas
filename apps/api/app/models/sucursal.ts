import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import type { FormatoImpresion } from '#constants/sunat'
import Empresa from '#models/empresa'

export default class Sucursal extends BaseModel {
  static table = 'sucursales'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare empresaId: number

  @column()
  declare nombre: string

  @column()
  declare codLocal: string

  @column()
  declare direccion: string

  @column()
  declare ubigeo: string

  @column()
  declare sunatSucursalId: number | null

  @column()
  declare esPrincipal: boolean

  @column()
  declare formatoImpresion: FormatoImpresion | null

  @column()
  declare activo: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => Empresa)
  declare empresa: BelongsTo<typeof Empresa>
}
