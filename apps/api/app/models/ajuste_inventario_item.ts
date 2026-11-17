import { BaseModel, column } from '@adonisjs/lucid/orm'
import { aNumero } from '#models/columnas'

export default class AjusteInventarioItem extends BaseModel {
  static table = 'ajustes_inventario_items'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare ajusteId: number

  @column()
  declare productoId: number

  @column({ consume: aNumero })
  declare cantidad: number

  @column({ consume: aNumero })
  declare costoUnitario: number
}
