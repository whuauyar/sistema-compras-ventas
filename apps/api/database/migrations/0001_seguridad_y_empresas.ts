import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Fase 1: usuarios, empresas (tenants), sucursales, almacenes, cajas y RBAC.
 * Todas las tablas de negocio llevan empresa_id (multi-tenant por fila).
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('empresas', (t) => {
      t.increments('id')
      t.string('ruc', 11).notNullable().unique()
      t.string('razon_social', 255).notNullable()
      t.string('nombre_comercial', 255).nullable()
      t.string('direccion', 500).notNullable()
      t.string('ubigeo', 6).notNullable()
      t.string('departamento', 100).nullable()
      t.string('provincia', 100).nullable()
      t.string('distrito', 100).nullable()
      t.enum('regimen', ['general', 'mype', 'rer', 'rus']).notNullable().defaultTo('general')
      t.enum('entorno', ['beta', 'production']).notNullable().defaultTo('beta')
      t.integer('sunat_tenant_id').nullable()
      // Credenciales de la API SUNAT cifradas (nunca en texto plano)
      t.text('sunat_api_key_cifrada').notNullable()
      t.text('sunat_api_secret_cifrada').notNullable()
      t.boolean('gre_configurada').notNullable().defaultTo(false)
      t.string('logo_url', 500).nullable()
      t.enum('formato_impresion', ['a4', 'a5', 'ticket-80', 'ticket-58'])
        .notNullable()
        .defaultTo('a4')
      t.boolean('permitir_venta_sin_stock').notNullable().defaultTo(false)
      t.decimal('igv_tasa', 5, 4).notNullable().defaultTo(0.18)
      t.boolean('activo').notNullable().defaultTo(true)
      t.timestamp('created_at').notNullable()
      t.timestamp('updated_at').nullable()
    })

    this.schema.createTable('usuarios', (t) => {
      t.increments('id')
      t.string('nombre_completo', 150).notNullable()
      t.string('email', 254).notNullable().unique()
      t.string('password').notNullable()
      t.string('telefono', 20).nullable()
      t.string('avatar_url', 500).nullable()
      t.integer('empresa_predeterminada_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('empresas')
        .onDelete('SET NULL')
      t.enum('formato_impresion', ['a4', 'a5', 'ticket-80', 'ticket-58']).nullable()
      t.boolean('activo').notNullable().defaultTo(true)
      t.timestamp('ultimo_acceso_en').nullable()
      t.timestamp('created_at').notNullable()
      t.timestamp('updated_at').nullable()
    })

    this.schema.createTable('auth_access_tokens', (t) => {
      t.increments('id')
      t.integer('tokenable_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('usuarios')
        .onDelete('CASCADE')
      t.string('type').notNullable()
      t.string('name').nullable()
      t.string('hash').notNullable()
      t.text('abilities').notNullable()
      t.timestamp('created_at')
      t.timestamp('updated_at')
      t.timestamp('last_used_at').nullable()
      t.timestamp('expires_at').nullable()
    })

    this.schema.createTable('sucursales', (t) => {
      t.increments('id')
      t.integer('empresa_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('empresas')
        .onDelete('CASCADE')
      t.string('nombre', 100).notNullable()
      t.string('cod_local', 4).notNullable()
      t.string('direccion', 500).notNullable()
      t.string('ubigeo', 6).notNullable()
      t.integer('sunat_sucursal_id').nullable()
      t.boolean('es_principal').notNullable().defaultTo(false)
      t.enum('formato_impresion', ['a4', 'a5', 'ticket-80', 'ticket-58']).nullable()
      t.boolean('activo').notNullable().defaultTo(true)
      t.timestamp('created_at').notNullable()
      t.timestamp('updated_at').nullable()
      t.unique(['empresa_id', 'cod_local'])
    })

    this.schema.createTable('almacenes', (t) => {
      t.increments('id')
      t.integer('empresa_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('empresas')
        .onDelete('CASCADE')
      t.integer('sucursal_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('sucursales')
        .onDelete('CASCADE')
      t.string('nombre', 100).notNullable()
      t.boolean('activo').notNullable().defaultTo(true)
      t.timestamp('created_at').notNullable()
      t.timestamp('updated_at').nullable()
      t.index(['empresa_id', 'sucursal_id'])
    })

    this.schema.createTable('cajas', (t) => {
      t.increments('id')
      t.integer('empresa_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('empresas')
        .onDelete('CASCADE')
      t.integer('sucursal_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('sucursales')
        .onDelete('CASCADE')
      t.string('nombre', 100).notNullable()
      t.enum('formato_impresion', ['a4', 'a5', 'ticket-80', 'ticket-58']).nullable()
      t.boolean('activo').notNullable().defaultTo(true)
      t.timestamp('created_at').notNullable()
      t.timestamp('updated_at').nullable()
      t.index(['empresa_id', 'sucursal_id'])
    })

    this.schema.createTable('permisos', (t) => {
      t.increments('id')
      t.string('codigo', 80).notNullable().unique()
      t.string('modulo', 40).notNullable()
      t.string('accion', 40).notNullable()
      t.string('descripcion', 200).notNullable()
    })

    this.schema.createTable('roles', (t) => {
      t.increments('id')
      t.integer('empresa_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('empresas')
        .onDelete('CASCADE')
      t.string('nombre', 60).notNullable()
      t.string('descripcion', 200).nullable()
      t.boolean('es_sistema').notNullable().defaultTo(false)
      t.timestamp('created_at').notNullable()
      t.timestamp('updated_at').nullable()
      t.unique(['empresa_id', 'nombre'])
    })

    this.schema.createTable('rol_permiso', (t) => {
      t.integer('rol_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('roles')
        .onDelete('CASCADE')
      t.integer('permiso_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('permisos')
        .onDelete('CASCADE')
      t.primary(['rol_id', 'permiso_id'])
    })

    this.schema.createTable('usuario_empresa_rol', (t) => {
      t.increments('id')
      t.integer('usuario_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('usuarios')
        .onDelete('CASCADE')
      t.integer('empresa_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('empresas')
        .onDelete('CASCADE')
      t.integer('rol_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('roles')
        .onDelete('RESTRICT')
      t.boolean('activo').notNullable().defaultTo(true)
      t.timestamp('created_at').notNullable()
      t.timestamp('updated_at').nullable()
      t.unique(['usuario_id', 'empresa_id'])
    })

    this.schema.createTable('usuario_sucursal', (t) => {
      t.integer('usuario_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('usuarios')
        .onDelete('CASCADE')
      t.integer('sucursal_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('sucursales')
        .onDelete('CASCADE')
      t.primary(['usuario_id', 'sucursal_id'])
    })
  }

  async down() {
    for (const tabla of [
      'usuario_sucursal',
      'usuario_empresa_rol',
      'rol_permiso',
      'roles',
      'permisos',
      'cajas',
      'almacenes',
      'sucursales',
      'auth_access_tokens',
      'usuarios',
      'empresas',
    ]) {
      this.schema.dropTableIfExists(tabla)
    }
  }
}
