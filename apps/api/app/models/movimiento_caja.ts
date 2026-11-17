import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { aNumero } from '#models/columnas'

export default class MovimientoCaja extends BaseModel {
  static table = 'movimientos_caja'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare empresaId: number

  @column()
  declare aperturaCajaId: number

  @column()
  declare tipo: string

  @column()
  declare concepto: string

  @column()
  declare metodo: string

  @column({ consume: aNumero })
  declare monto: number

  @column()
  declare ventaId: number | null

  @column()
  declare cobroId: number | null

  @column()
  declare createdBy: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
