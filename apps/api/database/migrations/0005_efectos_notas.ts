import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Fase 5: efectos locales de las notas de crédito (reposición de stock al ser ACEPTADAS).
 * detalle_stock guarda qué ítems de la venta devuelve la NC; stock_aplicado evita aplicarlo dos veces.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('comprobantes', (t) => {
      t.jsonb('detalle_stock').nullable()
      t.boolean('stock_aplicado').notNullable().defaultTo(false)
    })
  }

  async down() {
    this.schema.alterTable('comprobantes', (t) => {
      t.dropColumn('detalle_stock')
      t.dropColumn('stock_aplicado')
    })
  }
}
