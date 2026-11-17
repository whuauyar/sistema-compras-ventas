import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Empresa from '#models/empresa'
import Rol from '#models/rol'
import Usuario from '#models/usuario'

/** Membresía: qué rol tiene un usuario en cada empresa. */
export default class UsuarioEmpresaRol extends BaseModel {
  static table = 'usuario_empresa_rol'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare usuarioId: number

  @column()
  declare empresaId: number

  @column()
  declare rolId: number

  @column()
  declare activo: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => Empresa)
  declare empresa: BelongsTo<typeof Empresa>

  @belongsTo(() => Rol)
  declare rol: BelongsTo<typeof Rol>

  @belongsTo(() => Usuario)
  declare usuario: BelongsTo<typeof Usuario>
}
