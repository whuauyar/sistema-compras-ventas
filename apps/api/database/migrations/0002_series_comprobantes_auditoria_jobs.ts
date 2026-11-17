import { BaseSchema } from '@adonisjs/lucid/schema'

const ESTADOS_SUNAT = [
  'borrador',
  'pendiente',
  'enviado',
  'aceptado',
  'rechazado',
  'anulacion_en_proceso',
  'anulado',
  'error_envio',
]

/**
 * Fase 2: series, comprobantes (espejo local de la API SUNAT), auditoría y cola de trabajos.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('series', (t) => {
      t.increments('id')
      t.integer('empresa_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('empresas')
        .onDelete('CASCADE')
      t.integer('sucursal_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('sucursales')
        .onDelete('SET NULL')
      t.string('tipo_documento', 2).notNullable()
      t.string('serie', 4).notNullable()
      t.integer('sunat_serie_id').nullable()
      t.boolean('activo').notNullable().defaultTo(true)
      t.timestamp('created_at').notNullable()
      t.timestamp('updated_at').nullable()
      t.unique(['empresa_id', 'serie'])
      t.index(['empresa_id', 'tipo_documento'])
    })

    this.schema.createTable('comprobantes', (t) => {
      t.increments('id')
      t.uuid('uuid').notNullable().unique() // también se usa como Idempotency-Key ante la API
      t.integer('empresa_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('empresas')
        .onDelete('CASCADE')
      t.integer('sucursal_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('sucursales')
        .onDelete('SET NULL')
      t.integer('venta_id').unsigned().nullable() // FK se agrega en la fase de Ventas
      t.integer('doc_referencia_id').unsigned().nullable().references('id').inTable('comprobantes')
      t.string('tipo_documento', 2).notNullable()
      t.string('serie', 4).notNullable()
      t.integer('correlativo').nullable()
      t.string('numero_completo', 20).nullable()
      t.date('fecha_emision').notNullable()
      t.string('moneda', 3).notNullable().defaultTo('PEN')
      t.string('forma_pago', 10).notNullable().defaultTo('Contado')
      t.string('cliente_tipo_doc', 1).notNullable()
      t.string('cliente_num_doc', 15).notNullable()
      t.string('cliente_razon_social', 255).notNullable()
      t.decimal('total_gravadas', 14, 2).notNullable().defaultTo(0)
      t.decimal('total_igv', 14, 2).notNullable().defaultTo(0)
      t.decimal('total', 14, 2).notNullable().defaultTo(0)
      t.integer('sunat_api_id').nullable()
      t.enum('sunat_estado', ESTADOS_SUNAT).notNullable().defaultTo('borrador')
      t.string('sunat_codigo', 20).nullable()
      t.text('sunat_descripcion').nullable()
      t.jsonb('sunat_notas').nullable()
      t.string('hash_cpe', 100).nullable()
      t.jsonb('payload').notNullable()
      t.jsonb('ultima_respuesta').nullable()
      t.timestamp('sunat_consultado_en').nullable()
      t.integer('created_by')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('usuarios')
        .onDelete('SET NULL')
      t.timestamp('created_at').notNullable()
      t.timestamp('updated_at').nullable()
      t.unique(['empresa_id', 'tipo_documento', 'sunat_api_id'])
      t.index(['empresa_id', 'sunat_estado'])
      t.index(['empresa_id', 'fecha_emision'])
    })

    this.schema.createTable('auditorias', (t) => {
      t.bigIncrements('id')
      t.integer('empresa_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('empresas')
        .onDelete('CASCADE')
      t.integer('usuario_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('usuarios')
        .onDelete('SET NULL')
      t.string('accion', 60).notNullable()
      t.string('entidad', 60).notNullable()
      t.string('entidad_id', 40).nullable()
      t.jsonb('antes').nullable()
      t.jsonb('despues').nullable()
      t.string('ip', 64).nullable()
      t.timestamp('created_at').notNullable()
      t.index(['empresa_id', 'created_at'])
    })

    this.schema.createTable('jobs', (t) => {
      t.bigIncrements('id')
      t.string('tipo', 80).notNullable()
      t.jsonb('payload').notNullable()
      t.integer('empresa_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('empresas')
        .onDelete('CASCADE')
      t.enum('estado', ['pendiente', 'procesando', 'completado', 'fallido'])
        .notNullable()
        .defaultTo('pendiente')
      t.integer('intentos').notNullable().defaultTo(0)
      t.integer('max_intentos').notNullable().defaultTo(5)
      t.timestamp('disponible_en').notNullable()
      t.text('ultimo_error').nullable()
      t.timestamp('created_at').notNullable()
      t.timestamp('updated_at').nullable()
      t.index(['estado', 'disponible_en'])
    })
  }

  async down() {
    for (const tabla of ['jobs', 'auditorias', 'comprobantes', 'series']) {
      this.schema.dropTableIfExists(tabla)
    }
  }
}
