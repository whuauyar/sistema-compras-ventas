import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import TransferenciaItem from '#models/transferencia_item'

export default class Transferencia extends BaseModel {
  static table = 'transferencias'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare empresaId: number

  @column()
  declare almacenOrigenId: number

  @column()
  declare almacenDestinoId: number

  @column()
  declare observacion: string | null

  @column.dateTime()
  declare fecha: DateTime

  @column()
  declare createdBy: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @hasMany(() => TransferenciaItem, { foreignKey: 'transferenciaId' })
  declare items: HasMany<typeof TransferenciaItem>
}
