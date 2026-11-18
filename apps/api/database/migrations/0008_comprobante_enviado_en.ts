import { BaseSchema } from '@adonisjs/lucid/schema'

/** Fecha en que el comprobante quedó registrado en la API SUNAT (columna "Envío"). */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('comprobantes', (t) => {
      t.timestamp('sunat_enviado_en').nullable()
      t.index(['empresa_id', 'serie'])
    })
    this.defer(async (db) => {
      await db.rawQuery(
        'update comprobantes set sunat_enviado_en = created_at where sunat_api_id is not null'
      )
    })
  }

  async down() {
    this.schema.alterTable('comprobantes', (t) => {
      t.dropIndex(['empresa_id', 'serie'])
      t.dropColumn('sunat_enviado_en')
    })
  }
}
