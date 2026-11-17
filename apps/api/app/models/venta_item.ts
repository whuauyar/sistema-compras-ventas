import { BaseModel, column } from '@adonisjs/lucid/orm'
import { aNumero } from '#models/columnas'

export default class VentaItem extends BaseModel {
  static table = 'ventas_items'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare ventaId: number

  @column()
  declare productoId: number

  @column()
  declare codigo: string | null

  @column()
  declare descripcion: string

  @column()
  declare unidad: string

  @column({ consume: aNumero })
  declare cantidad: number

  @column({ consume: aNumero })
  declare precioLista: number

  @column({ consume: aNumero })
  declare descuento: number

  @column({ consume: aNumero })
  declare precioUnitario: number

  @column()
  declare tipAfeIgv: string

  @column({ consume: aNumero })
  declare subtotal: number

  @column({ consume: aNumero })
  declare costoUnitario: number

  @column({ consume: aNumero })
  declare cantidadDevuelta: number
}
