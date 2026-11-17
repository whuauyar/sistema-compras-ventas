import { DateTime } from 'luxon'
import { BaseModel, column, manyToMany } from '@adonisjs/lucid/orm'
import type { ManyToMany } from '@adonisjs/lucid/types/relations'
import Permiso from '#models/permiso'

export default class Rol extends BaseModel {
  static table = 'roles'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare empresaId: number

  @column()
  declare nombre: string

  @column()
  declare descripcion: string | null

  @column()
  declare esSistema: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @manyToMany(() => Permiso, {
    pivotTable: 'rol_permiso',
    pivotForeignKey: 'rol_id',
    pivotRelatedForeignKey: 'permiso_id',
  })
  declare permisos: ManyToMany<typeof Permiso>
}
