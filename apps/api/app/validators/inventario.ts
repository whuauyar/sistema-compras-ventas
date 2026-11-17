import vine from '@vinejs/vine'

const cantidad = () => vine.number().positive().max(9_999_999)
const precio = () => vine.number().min(0).max(99_999_999)
const fecha = () => vine.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const categoriaValidator = vine.compile(
  vine.object({
    nombre: vine.string().trim().minLength(2).maxLength(100),
    activo: vine.boolean().optional(),
  })
)

export const productoValidator = vine.compile(
  vine.object({
    codigo: vine.string().trim().toUpperCase().minLength(1).maxLength(30),
    codigo_barras: vine.string().trim().maxLength(50).nullable().optional(),
    nombre: vine.string().trim().minLength(2).maxLength(250),
    descripcion: vine.string().trim().maxLength(2000).nullable().optional(),
    categoria_id: vine.number().positive().nullable().optional(),
    unidad: vine
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{2,3}$/),
    tip_afe_igv: vine.string().regex(/^\d{2}$/),
    controla_stock: vine.boolean(),
    precio_venta: precio(),
    stock_minimo: vine.number().min(0).optional(),
    activo: vine.boolean().optional(),
  })
)

export const contactoValidator = vine.compile(
  vine.object({
    tipo_doc: vine.enum(['0', '1', '4', '6', '7', 'A'] as const),
    num_doc: vine.string().trim().maxLength(15),
    razon_social: vine.string().trim().minLength(2).maxLength(255),
    nombre_comercial: vine.string().trim().maxLength(255).nullable().optional(),
    direccion: vine.string().trim().maxLength(500).nullable().optional(),
    ubigeo: vine
      .string()
      .trim()
      .regex(/^\d{6}$/)
      .nullable()
      .optional(),
    email: vine.string().trim().email().nullable().optional(),
    telefono: vine.string().trim().maxLength(20).nullable().optional(),
    activo: vine.boolean().optional(),
  })
)

export const ajusteValidator = vine.compile(
  vine.object({
    almacen_id: vine.number().positive(),
    tipo: vine.enum(['entrada', 'salida'] as const),
    motivo: vine.enum(['inventario_inicial', 'ajuste', 'merma', 'otro'] as const),
    observacion: vine.string().trim().maxLength(500).nullable().optional(),
    items: vine
      .array(
        vine.object({
          producto_id: vine.number().positive(),
          cantidad: cantidad(),
          costo_unitario: precio().optional(),
        })
      )
      .minLength(1),
  })
)

export const transferenciaValidator = vine.compile(
  vine.object({
    almacen_origen_id: vine.number().positive(),
    almacen_destino_id: vine.number().positive(),
    observacion: vine.string().trim().maxLength(500).nullable().optional(),
    items: vine
      .array(vine.object({ producto_id: vine.number().positive(), cantidad: cantidad() }))
      .minLength(1),
  })
)

const itemCompra = () =>
  vine.object({
    producto_id: vine.number().positive(),
    descripcion: vine.string().trim().maxLength(500).optional(),
    cantidad: cantidad(),
    precio_unitario: precio(),
    tip_afe_igv: vine
      .string()
      .regex(/^\d{2}$/)
      .optional(),
  })

export const compraValidator = vine.compile(
  vine.object({
    proveedor_id: vine.number().positive(),
    almacen_id: vine.number().positive(),
    orden_compra_id: vine.number().positive().nullable().optional(),
    tipo_documento: vine.enum(['01', '03', '12', '00'] as const),
    serie: vine.string().trim().toUpperCase().minLength(1).maxLength(4),
    numero: vine
      .string()
      .trim()
      .regex(/^\d{1,10}$/),
    fecha_emision: fecha(),
    moneda: vine.enum(['PEN', 'USD'] as const),
    tipo_cambio: vine.number().positive().optional(),
    forma_pago: vine.enum(['Contado', 'Credito'] as const),
    dias_credito: vine.number().range([1, 365]).optional(),
    cuotas: vine
      .array(vine.object({ monto: vine.number().positive(), fecha_vencimiento: fecha() }))
      .optional(),
    observacion: vine.string().trim().maxLength(500).nullable().optional(),
    items: vine.array(itemCompra()).minLength(1),
  })
)

export const ordenCompraValidator = vine.compile(
  vine.object({
    proveedor_id: vine.number().positive(),
    almacen_id: vine.number().positive(),
    fecha: fecha(),
    fecha_entrega: fecha().nullable().optional(),
    moneda: vine.enum(['PEN', 'USD'] as const),
    observacion: vine.string().trim().maxLength(500).nullable().optional(),
    items: vine.array(itemCompra()).minLength(1),
  })
)

export const pagoValidator = vine.compile(
  vine.object({
    monto: vine.number().positive(),
    metodo: vine.enum([
      'efectivo',
      'yape',
      'plin',
      'transferencia',
      'tarjeta',
      'cheque',
      'otro',
    ] as const),
    fecha: fecha().optional(),
    referencia: vine.string().trim().maxLength(100).nullable().optional(),
  })
)

export const listadoValidator = vine.compile(
  vine.object({
    pagina: vine.number().positive().optional(),
    por_pagina: vine.number().range([5, 200]).optional(),
    buscar: vine.string().trim().maxLength(100).optional(),
    estado: vine.string().trim().maxLength(60).optional(),
    desde: fecha().optional(),
    hasta: fecha().optional(),
    almacen_id: vine.number().positive().optional(),
    producto_id: vine.number().positive().optional(),
    categoria_id: vine.number().positive().optional(),
    solo_bajo_minimo: vine.boolean().optional(),
  })
)
