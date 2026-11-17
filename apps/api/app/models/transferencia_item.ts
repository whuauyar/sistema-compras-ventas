import { BaseModel, column } from '@adonisjs/lucid/orm'
import { aNumero } from '#models/columnas'

export default class TransferenciaItem extends BaseModel {
  static table = 'transferencias_items'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare transferenciaId: number

  @column()
  declare productoId: number

  @column({ consume: aNumero })
  declare cantidad: number

  @column({ consume: aNumero })
  declare costoUnitario: number
}
