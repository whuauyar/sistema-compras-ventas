import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Fases 4 y 5: caja, ventas (POS) con pagos y crédito, cuentas por cobrar,
 * datos de notas de crédito/débito y guías en comprobantes, y anulaciones (baja / resumen diario).
 */
export default class extends BaseSchema {
  async up() {
    const empresa = (t: any) =>
      t
        .integer('empresa_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('empresas')
        .onDelete('CASCADE')
    const usuario = (t: any, col = 'created_by') =>
      t.integer(col).unsigned().nullable().references('id').inTable('usuarios').onDelete('SET NULL')
    const tiempos = (t: any) => {
      t.timestamp('created_at').notNullable()
      t.timestamp('updated_at').nullable()
    }

    this.schema.createTable('aperturas_caja', (t) => {
      t.increments('id')
      empresa(t)
      t.integer('caja_id').unsigned().notNullable().references('id').inTable('cajas')
      t.integer('usuario_id').unsigned().notNullable().references('id').inTable('usuarios')
      t.timestamp('abierta_en').notNullable()
      t.decimal('monto_inicial', 14, 2).notNullable().defaultTo(0)
      t.timestamp('cerrada_en').nullable()
      t.decimal('monto_esperado', 14, 2).nullable()
      t.decimal('monto_declarado', 14, 2).nullable()
      t.decimal('diferencia', 14, 2).nullable()
      t.string('observacion', 500).nullable()
      t.enum('estado', ['abierta', 'cerrada']).notNullable().defaultTo('abierta')
      tiempos(t)
      t.index(['empresa_id', 'caja_id', 'estado'])
    })

    this.schema.createTable('ventas', (t) => {
      t.increments('id')
      empresa(t)
      t.integer('sucursal_id').unsigned().notNullable().references('id').inTable('sucursales')
      t.integer('almacen_id').unsigned().notNullable().references('id').inTable('almacenes')
      t.integer('caja_id').unsigned().nullable().references('id').inTable('cajas')
      t.integer('apertura_caja_id').unsigned().nullable().references('id').inTable('aperturas_caja')
      t.integer('cliente_id').unsigned().nullable().references('id').inTable('clientes')
      t.string('cliente_tipo_doc', 1).notNullable()
      t.string('cliente_num_doc', 15).notNullable()
      t.string('cliente_razon_social', 255).notNullable()
      t.string('cliente_direccion', 500).nullable()
      t.string('tipo_documento', 2).notNullable()
      t.date('fecha').notNullable()
      t.string('moneda', 3).notNullable().defaultTo('PEN')
      t.string('forma_pago', 10).notNullable().defaultTo('Contado')
      t.decimal('total_gravadas', 14, 2).notNullable().defaultTo(0)
      t.decimal('total_igv', 14, 2).notNullable().defaultTo(0)
      t.decimal('total_descuentos', 14, 2).notNullable().defaultTo(0)
      t.decimal('total', 14, 2).notNullable().defaultTo(0)
      t.decimal('costo_total', 14, 2).notNullable().defaultTo(0) // costo de ventas (kardex)
      t.decimal('vuelto', 14, 2).notNullable().defaultTo(0)
      t.enum('estado', ['completada', 'anulada']).notNullable().defaultTo('completada')
      t.integer('comprobante_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('comprobantes')
        .onDelete('SET NULL')
      usuario(t)
      tiempos(t)
      t.index(['empresa_id', 'fecha'])
    })

    this.schema.createTable('ventas_items', (t) => {
      t.increments('id')
      t.integer('venta_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('ventas')
        .onDelete('CASCADE')
      t.integer('producto_id').unsigned().notNullable().references('id').inTable('productos')
      t.string('codigo', 30).nullable()
      t.string('descripcion', 500).notNullable()
      t.string('unidad', 3).notNullable()
      t.decimal('cantidad', 14, 4).notNullable()
      t.decimal('precio_lista', 14, 6).notNullable() // con IGV, antes del descuento
      t.decimal('descuento', 14, 2).notNullable().defaultTo(0) // monto total de descuento del ítem
      t.decimal('precio_unitario', 14, 6).notNullable() // con IGV, después del descuento
      t.string('tip_afe_igv', 2).notNullable()
      t.decimal('subtotal', 14, 2).notNullable()
      t.decimal('costo_unitario', 14, 6).notNullable().defaultTo(0)
      t.decimal('cantidad_devuelta', 14, 4).notNullable().defaultTo(0)
    })

    this.schema.createTable('ventas_pagos', (t) => {
      t.increments('id')
      t.integer('venta_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('ventas')
        .onDelete('CASCADE')
      t.string('metodo', 20).notNullable()
      t.decimal('monto', 14, 2).notNullable()
      t.string('referencia', 100).nullable()
    })

    this.schema.createTable('cuentas_cobrar', (t) => {
      t.increments('id')
      empresa(t)
      t.integer('venta_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('ventas')
        .onDelete('CASCADE')
      t.integer('cliente_id').unsigned().nullable().references('id').inTable('clientes')
      t.integer('numero_cuota').notNullable()
      t.date('fecha_vencimiento').notNullable()
      t.string('moneda', 3).notNullable()
      t.decimal('monto', 14, 2).notNullable()
      t.decimal('saldo', 14, 2).notNullable()
      t.enum('estado', ['pendiente', 'parcial', 'pagada', 'anulada'])
        .notNullable()
        .defaultTo('pendiente')
      tiempos(t)
      t.index(['empresa_id', 'estado', 'fecha_vencimiento'])
    })

    this.schema.createTable('cobros', (t) => {
      t.increments('id')
      empresa(t)
      t.integer('cuenta_cobrar_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('cuentas_cobrar')
        .onDelete('CASCADE')
      t.integer('apertura_caja_id').unsigned().nullable().references('id').inTable('aperturas_caja')
      t.date('fecha').notNullable()
      t.decimal('monto', 14, 2).notNullable()
      t.string('metodo', 20).notNullable()
      t.string('referencia', 100).nullable()
      usuario(t)
      t.timestamp('created_at').notNullable()
    })

    this.schema.createTable('movimientos_caja', (t) => {
      t.increments('id')
      empresa(t)
      t.integer('apertura_caja_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('aperturas_caja')
        .onDelete('CASCADE')
      t.enum('tipo', ['ingreso', 'egreso']).notNullable()
      t.string('concepto', 200).notNullable()
      t.string('metodo', 20).notNullable()
      t.decimal('monto', 14, 2).notNullable()
      t.integer('venta_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('ventas')
        .onDelete('SET NULL')
      t.integer('cobro_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('cobros')
        .onDelete('SET NULL')
      usuario(t)
      t.timestamp('created_at').notNullable()
    })

    this.schema.alterTable('comprobantes', (t) => {
      t.foreign('venta_id').references('id').inTable('ventas').onDelete('SET NULL')
      t.string('cod_motivo', 2).nullable()
      t.string('des_motivo', 250).nullable()
      t.boolean('repone_stock').notNullable().defaultTo(false)
    })

    this.schema.createTable('anulaciones', (t) => {
      t.increments('id')
      empresa(t)
      t.enum('tipo', ['baja', 'resumen']).notNullable()
      t.integer('sunat_api_id').notNullable()
      t.string('identificador', 40).nullable()
      t.date('fecha').notNullable()
      t.string('motivo', 255).notNullable()
      t.enum('estado', ['enviado', 'pendiente', 'aceptado', 'rechazado'])
        .notNullable()
        .defaultTo('enviado')
      t.text('sunat_descripcion').nullable()
      t.specificType('comprobante_ids', 'integer[]').notNullable()
      t.jsonb('ultima_respuesta').nullable()
      usuario(t)
      tiempos(t)
      t.index(['empresa_id', 'estado'])
    })
  }

  async down() {
    this.schema.dropTableIfExists('anulaciones')
    this.schema.alterTable('comprobantes', (t) => {
      t.dropForeign('venta_id')
      t.dropColumn('cod_motivo')
      t.dropColumn('des_motivo')
      t.dropColumn('repone_stock')
    })
    for (const tabla of [
      'movimientos_caja',
      'cobros',
      'cuentas_cobrar',
      'ventas_pagos',
      'ventas_items',
      'ventas',
      'aperturas_caja',
    ]) {
      this.schema.dropTableIfExists(tabla)
    }
  }
}
