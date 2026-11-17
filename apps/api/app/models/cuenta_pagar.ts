import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { aNumero } from '#models/columnas'
import Compra from '#models/compra'
import Proveedor from '#models/proveedor'

export default class CuentaPagar extends BaseModel {
  static table = 'cuentas_pagar'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare empresaId: number

  @column()
  declare compraId: number

  @column()
  declare proveedorId: number

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

  @belongsTo(() => Proveedor)
  declare proveedor: BelongsTo<typeof Proveedor>

  @belongsTo(() => Compra)
  declare compra: BelongsTo<typeof Compra>
}
