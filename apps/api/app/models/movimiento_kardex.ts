import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { aNumero } from '#models/columnas'

export default class MovimientoKardex extends BaseModel {
  static table = 'movimientos_kardex'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare empresaId: number

  @column()
  declare almacenId: number

  @column()
  declare productoId: number

  @column.dateTime()
  declare fecha: DateTime

  @column()
  declare tipo: string

  @column()
  declare motivo: string

  @column()
  declare documentoTipo: string | null

  @column()
  declare documentoId: number | null

  @column()
  declare referencia: string | null

  @column({ consume: aNumero })
  declare cantidad: number

  @column({ consume: aNumero })
  declare costoUnitario: number

  @column({ consume: aNumero })
  declare costoTotal: number

  @column({ consume: aNumero })
  declare saldoCantidad: number

  @column({ consume: aNumero })
  declare saldoCostoPromedio: number

  @column({ consume: aNumero })
  declare saldoValor: number

  @column()
  declare createdBy: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
