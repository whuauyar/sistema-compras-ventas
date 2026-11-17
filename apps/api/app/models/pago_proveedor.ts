import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { aNumero } from '#models/columnas'

export default class PagoProveedor extends BaseModel {
  static table = 'pagos_proveedor'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare empresaId: number

  @column()
  declare cuentaPagarId: number

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
