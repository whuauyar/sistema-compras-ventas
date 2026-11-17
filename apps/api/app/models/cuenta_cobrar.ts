import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { aNumero } from '#models/columnas'
import Venta from '#models/venta'

export default class CuentaCobrar extends BaseModel {
  static table = 'cuentas_cobrar'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare empresaId: number

  @column()
  declare ventaId: number

  @column()
  declare clienteId: number | null

  @column()
  declare numeroCuota: number

  @column.date()
  declare fechaVencimiento: DateTime

  @column()
  declare moneda: string

  @column({ consume: aNumero })
  declare monto: number

  @column({ consume: aNumero })
  declare saldo: number

  @column()
  declare estado: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => Venta)
  declare venta: BelongsTo<typeof Venta>
}
