import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Permiso extends BaseModel {
  static table = 'permisos'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare codigo: string

  @column()
  declare modulo: string

  @column()
  declare accion: string

  @column()
  declare descripcion: string
}
