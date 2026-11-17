import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Fase 3: catálogo de productos, stock por almacén con kardex valorizado (costo promedio),
 * ajustes y transferencias, proveedores/clientes, órdenes de compra, compras y cuentas por pagar.
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

    this.schema.createTable('categorias', (t) => {
      t.increments('id')
      empresa(t)
      t.string('nombre', 100).notNullable()
      t.boolean('activo').notNullable().defaultTo(true)
      tiempos(t)
      t.unique(['empresa_id', 'nombre'])
    })

    this.schema.createTable('productos', (t) => {
      t.increments('id')
      empresa(t)
      t.integer('categoria_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('categorias')
        .onDelete('SET NULL')
      t.string('codigo', 30).notNullable()
      t.string('codigo_barras', 50).nullable()
      t.string('nombre', 250).notNullable()
      t.text('descripcion').nullable()
      t.string('unidad', 3).notNullable().defaultTo('NIU')
      t.string('tip_afe_igv', 2).notNullable().defaultTo('10')
      t.boolean('controla_stock').notNullable().defaultTo(true)
      t.decimal('precio_venta', 14, 6).notNullable().defaultTo(0) // con IGV
      t.decimal('stock_minimo', 14, 4).notNullable().defaultTo(0)
      t.boolean('activo').notNullable().defaultTo(true)
      tiempos(t)
      t.unique(['empresa_id', 'codigo'])
      t.index(['empresa_id', 'codigo_barras'])
      t.index(['empresa_id', 'nombre'])
    })

    this.schema.createTable('stock', (t) => {
      t.increments('id')
      empresa(t)
      t.integer('almacen_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('almacenes')
        .onDelete('CASCADE')
      t.integer('producto_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('productos')
        .onDelete('CASCADE')
      t.decimal('cantidad', 14, 4).notNullable().defaultTo(0)
      t.decimal('costo_promedio', 14, 6).notNullable().defaultTo(0) // sin IGV, en PEN
      tiempos(t)
      t.unique(['almacen_id', 'producto_id'])
    })

    this.schema.createTable('movimientos_kardex', (t) => {
      t.bigIncrements('id')
      empresa(t)
      t.integer('almacen_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('almacenes')
        .onDelete('CASCADE')
      t.integer('producto_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('productos')
        .onDelete('CASCADE')
      t.timestamp('fecha').notNullable()
      t.enum('tipo', ['entrada', 'salida']).notNullable()
      t.string('motivo', 30).notNullable()
      t.string('documento_tipo', 30).nullable()
      t.integer('documento_id').nullable()
      t.string('referencia', 60).nullable()
      t.decimal('cantidad', 14, 4).notNullable()
      t.decimal('costo_unitario', 14, 6).notNullable()
      t.decimal('costo_total', 14, 2).notNullable()
      t.decimal('saldo_cantidad', 14, 4).notNullable()
      t.decimal('saldo_costo_promedio', 14, 6).notNullable()
      t.decimal('saldo_valor', 14, 2).notNullable()
      usuario(t)
      t.timestamp('created_at').notNullable()
      t.index(['empresa_id', 'producto_id', 'almacen_id', 'id'])
      t.index(['documento_tipo', 'documento_id'])
    })

    this.schema.createTable('ajustes_inventario', (t) => {
      t.increments('id')
      empresa(t)
      t.integer('almacen_id').unsigned().notNullable().references('id').inTable('almacenes')
      t.enum('tipo', ['entrada', 'salida']).notNullable()
      t.string('motivo', 30).notNullable() // inventario_inicial | ajuste | merma | otro
      t.string('observacion', 500).nullable()
      t.timestamp('fecha').notNullable()
      usuario(t)
      tiempos(t)
    })

    this.schema.createTable('ajustes_inventario_items', (t) => {
      t.increments('id')
      t.integer('ajuste_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('ajustes_inventario')
        .onDelete('CASCADE')
      t.integer('producto_id').unsigned().notNullable().references('id').inTable('productos')
      t.decimal('cantidad', 14, 4).notNullable()
      t.decimal('costo_unitario', 14, 6).notNullable()
    })

    this.schema.createTable('transferencias', (t) => {
      t.increments('id')
      empresa(t)
      t.integer('almacen_origen_id').unsigned().notNullable().references('id').inTable('almacenes')
      t.integer('almacen_destino_id').unsigned().notNullable().references('id').inTable('almacenes')
      t.string('observacion', 500).nullable()
      t.timestamp('fecha').notNullable()
      usuario(t)
      tiempos(t)
    })

    this.schema.createTable('transferencias_items', (t) => {
      t.increments('id')
      t.integer('transferencia_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('transferencias')
        .onDelete('CASCADE')
      t.integer('producto_id').unsigned().notNullable().references('id').inTable('productos')
      t.decimal('cantidad', 14, 4).notNullable()
      t.decimal('costo_unitario', 14, 6).notNullable()
    })

    for (const tabla of ['proveedores', 'clientes']) {
      this.schema.createTable(tabla, (t) => {
        t.increments('id')
        empresa(t)
        t.string('tipo_doc', 1).notNullable()
        t.string('num_doc', 15).notNullable()
        t.string('razon_social', 255).notNullable()
        t.string('nombre_comercial', 255).nullable()
        t.string('direccion', 500).nullable()
        t.string('ubigeo', 6).nullable()
        t.string('email', 254).nullable()
        t.string('telefono', 20).nullable()
        t.boolean('activo').notNullable().defaultTo(true)
        tiempos(t)
        t.unique(['empresa_id', 'tipo_doc', 'num_doc'])
        t.index(['empresa_id', 'razon_social'])
      })
    }

    this.schema.createTable('ordenes_compra', (t) => {
      t.increments('id')
      empresa(t)
      t.integer('sucursal_id').unsigned().notNullable().references('id').inTable('sucursales')
      t.integer('almacen_id').unsigned().notNullable().references('id').inTable('almacenes')
      t.integer('proveedor_id').unsigned().notNullable().references('id').inTable('proveedores')
      t.integer('numero').notNullable()
      t.date('fecha').notNullable()
      t.date('fecha_entrega').nullable()
      t.string('moneda', 3).notNullable().defaultTo('PEN')
      t.enum('estado', ['borrador', 'aprobada', 'recibida', 'anulada'])
        .notNullable()
        .defaultTo('borrador')
      t.string('observacion', 500).nullable()
      t.decimal('total_gravadas', 14, 2).notNullable().defaultTo(0)
      t.decimal('total_igv', 14, 2).notNullable().defaultTo(0)
      t.decimal('total', 14, 2).notNullable().defaultTo(0)
      usuario(t)
      usuario(t, 'aprobado_by')
      tiempos(t)
      t.unique(['empresa_id', 'numero'])
    })

    this.schema.createTable('ordenes_compra_items', (t) => {
      t.increments('id')
      t.integer('orden_compra_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('ordenes_compra')
        .onDelete('CASCADE')
      t.integer('producto_id').unsigned().notNullable().references('id').inTable('productos')
      t.string('descripcion', 500).notNullable()
      t.decimal('cantidad', 14, 4).notNullable()
      t.decimal('precio_unitario', 14, 6).notNullable() // con IGV
      t.string('tip_afe_igv', 2).notNullable()
      t.decimal('subtotal', 14, 2).notNullable()
    })

    this.schema.createTable('compras', (t) => {
      t.increments('id')
      empresa(t)
      t.integer('sucursal_id').unsigned().notNullable().references('id').inTable('sucursales')
      t.integer('almacen_id').unsigned().notNullable().references('id').inTable('almacenes')
      t.integer('proveedor_id').unsigned().notNullable().references('id').inTable('proveedores')
      t.integer('orden_compra_id').unsigned().nullable().references('id').inTable('ordenes_compra')
      t.string('tipo_documento', 2).notNullable() // 01 factura, 03 boleta, 12 ticket, 00 otro
      t.string('serie', 4).notNullable()
      t.string('numero', 10).notNullable()
      t.date('fecha_emision').notNullable()
      t.string('moneda', 3).notNullable().defaultTo('PEN')
      t.decimal('tipo_cambio', 10, 4).notNullable().defaultTo(1)
      t.string('forma_pago', 10).notNullable().defaultTo('Contado')
      t.decimal('total_gravadas', 14, 2).notNullable().defaultTo(0)
      t.decimal('total_exoneradas', 14, 2).notNullable().defaultTo(0)
      t.decimal('total_inafectas', 14, 2).notNullable().defaultTo(0)
      t.decimal('total_igv', 14, 2).notNullable().defaultTo(0)
      t.decimal('total', 14, 2).notNullable().defaultTo(0)
      t.enum('estado', ['registrada', 'anulada']).notNullable().defaultTo('registrada')
      t.string('observacion', 500).nullable()
      usuario(t)
      tiempos(t)
      t.unique(['empresa_id', 'proveedor_id', 'tipo_documento', 'serie', 'numero'])
      t.index(['empresa_id', 'fecha_emision'])
    })

    this.schema.createTable('compras_items', (t) => {
      t.increments('id')
      t.integer('compra_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('compras')
        .onDelete('CASCADE')
      t.integer('producto_id').unsigned().notNullable().references('id').inTable('productos')
      t.string('descripcion', 500).notNullable()
      t.decimal('cantidad', 14, 4).notNullable()
      t.decimal('precio_unitario', 14, 6).notNullable() // con IGV, en la moneda de la compra
      t.string('tip_afe_igv', 2).notNullable()
      t.decimal('costo_unitario', 14, 6).notNullable() // sin IGV, en PEN (va al kardex)
      t.decimal('subtotal', 14, 2).notNullable()
    })

    this.schema.createTable('cuentas_pagar', (t) => {
      t.increments('id')
      empresa(t)
      t.integer('compra_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('compras')
        .onDelete('CASCADE')
      t.integer('proveedor_id').unsigned().notNullable().references('id').inTable('proveedores')
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

    this.schema.createTable('pagos_proveedor', (t) => {
      t.increments('id')
      empresa(t)
      t.integer('cuenta_pagar_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('cuentas_pagar')
        .onDelete('CASCADE')
      t.date('fecha').notNullable()
      t.decimal('monto', 14, 2).notNullable()
      t.string('metodo', 20).notNullable()
      t.string('referencia', 100).nullable()
      usuario(t)
      t.timestamp('created_at').notNullable()
    })
  }

  async down() {
    for (const tabla of [
      'pagos_proveedor',
      'cuentas_pagar',
      'compras_items',
      'compras',
      'ordenes_compra_items',
      'ordenes_compra',
      'clientes',
      'proveedores',
      'transferencias_items',
      'transferencias',
      'ajustes_inventario_items',
      'ajustes_inventario',
      'movimientos_kardex',
      'stock',
      'productos',
      'categorias',
    ]) {
      this.schema.dropTableIfExists(tabla)
    }
  }
}
