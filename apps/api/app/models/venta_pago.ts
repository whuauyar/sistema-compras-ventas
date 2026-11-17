import { BaseModel, column } from '@adonisjs/lucid/orm'
import { aNumero } from '#models/columnas'

export default class VentaPago extends BaseModel {
  static table = 'ventas_pagos'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare ventaId: number

  @column()
  declare metodo: string

  @column({ consume: aNumero })
  declare monto: number

  @column()
  declare referencia: string | null
}
