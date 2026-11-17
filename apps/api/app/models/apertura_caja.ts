import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { aNumero } from '#models/columnas'
import Caja from '#models/caja'

export default class AperturaCaja extends BaseModel {
  static table = 'aperturas_caja'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare empresaId: number

  @column()
  declare cajaId: number

  @column()
  declare usuarioId: number

  @column.dateTime()
  declare abiertaEn: DateTime

  @column({ consume: aNumero })
  declare montoInicial: number

  @column.dateTime()
  declare cerradaEn: DateTime | null

  @column({ consume: aNumero })
  declare montoEsperado: number | null

  @column({ consume: aNumero })
  declare montoDeclarado: number | null

  @column({ consume: aNumero })
  declare diferencia: number | null

  @column()
  declare observacion: string | null

  @column()
  declare estado: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => Caja)
  declare caja: BelongsTo<typeof Caja>
}
