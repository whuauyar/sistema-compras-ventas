import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { aNumero } from '#models/columnas'
import Categoria from '#models/categoria'

export default class Producto extends BaseModel {
  static table = 'productos'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare empresaId: number

  @column()
  declare categoriaId: number | null

  @column()
  declare codigo: string

  @column()
  declare codigoBarras: string | null

  @column()
  declare nombre: string

  @column()
  declare descripcion: string | null

  @column()
  declare unidad: string

  @column()
  declare tipAfeIgv: string

  @column()
  declare controlaStock: boolean

  @column({ consume: aNumero })
  declare precioVenta: number

  @column({ consume: aNumero })
  declare stockMinimo: number

  @column()
  declare activo: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => Categoria)
  declare categoria: BelongsTo<typeof Categoria>
}
