import vine from '@vinejs/vine'
import { TIPOS_DOC_IDENTIDAD } from '#constants/sunat'

const metodo = () =>
  vine.enum(['efectivo', 'yape', 'plin', 'transferencia', 'tarjeta', 'cheque', 'otro'] as const)

export const ventaValidator = vine.compile(
  vine.object({
    tipo_documento: vine.enum(['01', '03'] as const),
    serie: vine.string().trim().toUpperCase().optional(),
    almacen_id: vine.number().positive().optional(),
    caja_id: vine.number().positive().nullable().optional(),
    cliente_id: vine.number().positive().nullable().optional(),
    cliente: vine
      .object({
        tipo_doc: vine.enum(TIPOS_DOC_IDENTIDAD),
        num_doc: vine.string().trim().maxLength(15),
        razon_social: vine.string().trim().maxLength(255),
        direccion: vine.string().trim().maxLength(500).nullable().optional(),
      })
      .optional(),
    moneda: vine.enum(['PEN', 'USD'] as const),
    forma_pago: vine.enum(['Contado', 'Credito'] as const),
    cuotas: vine
      .array(
        vine.object({
          monto: vine.number().positive(),
          fecha_pago: vine.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })
      )
      .optional(),
    items: vine
      .array(
        vine.object({
          producto_id: vine.number().positive(),
          cantidad: vine.number().positive().max(9_999_999),
          precio_unitario: vine.number().min(0).optional(),
          descuento: vine.number().min(0).optional(),
        })
      )
      .minLength(1),
    pagos: vine
      .array(
        vine.object({
          metodo: metodo(),
          monto: vine.number().positive(),
          referencia: vine.string().trim().maxLength(100).nullable().optional(),
        })
      )
      .optional(),
  })
)

export const cobroValidator = vine.compile(
  vine.object({
    monto: vine.number().positive(),
    metodo: metodo(),
    caja_id: vine.number().positive().nullable().optional(),
    referencia: vine.string().trim().maxLength(100).nullable().optional(),
  })
)

export const aperturaValidator = vine.compile(
  vine.object({ caja_id: vine.number().positive(), monto_inicial: vine.number().min(0) })
)

export const movimientoCajaValidator = vine.compile(
  vine.object({
    tipo: vine.enum(['ingreso', 'egreso'] as const),
    concepto: vine.string().trim().minLength(3).maxLength(200),
    monto: vine.number().positive(),
  })
)

export const cierreValidator = vine.compile(
  vine.object({
    monto_declarado: vine.number().min(0),
    observacion: vine.string().trim().maxLength(500).nullable().optional(),
  })
)
