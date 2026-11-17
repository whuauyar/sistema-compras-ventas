import { DateTime } from 'luxon'
import { BaseModel, column, manyToMany } from '@adonisjs/lucid/orm'
import type { ManyToMany } from '@adonisjs/lucid/types/relations'
import Permiso from '#models/permiso'

/** Rol base global: se copia a cada empresa nueva (lo administra el SuperAdmin). */
export default class RolPlantilla extends BaseModel {
  static table = 'roles_plantilla'

  @column({ isPrimary: true })
  declare id: number

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
    pivotTable: 'rol_plantilla_permiso',
    pivotForeignKey: 'rol_plantilla_id',
    pivotRelatedForeignKey: 'permiso_id',
  })
  declare permisos: ManyToMany<typeof Permiso>
}
