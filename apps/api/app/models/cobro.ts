import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { aNumero } from '#models/columnas'

export default class Cobro extends BaseModel {
  static table = 'cobros'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare empresaId: number

  @column()
  declare cuentaCobrarId: number

  @column()
  declare aperturaCajaId: number | null

  @column.date()
  declare fecha: DateTime

  @column({ consume: aNumero })
  declare monto: number

  @column()
  declare metodo: string

  @column()
  declare referencia: string | null

  @column()
  declare createdBy: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
