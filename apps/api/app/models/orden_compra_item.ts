import { BaseModel, column } from '@adonisjs/lucid/orm'
import { aNumero } from '#models/columnas'

export default class OrdenCompraItem extends BaseModel {
  static table = 'ordenes_compra_items'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare ordenCompraId: number

  @column()
  declare productoId: number

  @column()
  declare descripcion: string

  @column({ consume: aNumero })
  declare cantidad: number

  @column({ consume: aNumero })
  declare precioUnitario: number

  @column()
  declare tipAfeIgv: string

  @column({ consume: aNumero })
  declare subtotal: number
}
