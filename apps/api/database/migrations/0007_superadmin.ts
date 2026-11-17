import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * SuperAdmin de plataforma:
 * - usuarios.es_superadmin
 * - empresa_permiso: tope de permisos que cada empresa puede usar (lo define el SuperAdmin)
 * - roles_plantilla / rol_plantilla_permiso: roles base que se copian a cada empresa nueva
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('usuarios', (t) => {
      t.boolean('es_superadmin').notNullable().defaultTo(false)
    })

    this.schema.createTable('empresa_permiso', (t) => {
      t.integer('empresa_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('empresas')
        .onDelete('CASCADE')
      t.integer('permiso_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('permisos')
        .onDelete('CASCADE')
      t.primary(['empresa_id', 'permiso_id'])
    })

    this.schema.createTable('roles_plantilla', (t) => {
      t.increments('id')
      t.string('nombre', 60).notNullable().unique()
      t.string('descripcion', 200).nullable()
      t.boolean('es_sistema').notNullable().defaultTo(false)
      t.timestamp('created_at').notNullable()
      t.timestamp('updated_at').nullable()
    })

    this.schema.createTable('rol_plantilla_permiso', (t) => {
      t.integer('rol_plantilla_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('roles_plantilla')
        .onDelete('CASCADE')
      t.integer('permiso_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('permisos')
        .onDelete('CASCADE')
      t.primary(['rol_plantilla_id', 'permiso_id'])
    })

    // Empresas existentes: conservan todo lo que ya podían usar
    this.defer(async (db) => {
      await db.rawQuery(
        `insert into empresa_permiso (empresa_id, permiso_id)
         select e.id, p.id from empresas e cross join permisos p
         on conflict do nothing`
      )
    })
  }

  async down() {
    this.schema.dropTable('rol_plantilla_permiso')
    this.schema.dropTable('roles_plantilla')
    this.schema.dropTable('empresa_permiso')
    this.schema.alterTable('usuarios', (t) => {
      t.dropColumn('es_superadmin')
    })
  }
}
