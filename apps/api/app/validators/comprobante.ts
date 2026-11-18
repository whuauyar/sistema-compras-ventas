import vine from '@vinejs/vine'
import { FORMATOS_IMPRESION, TIPOS_DOC_IDENTIDAD } from '#constants/sunat'

export const emitirComprobanteValidator = vine.compile(
  vine.object({
    tipo_documento: vine.enum(['01', '03'] as const),
    serie: vine.string().trim().toUpperCase().optional(),
    sucursal_id: vine.number().positive().optional(),
    fecha_emision: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),
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
    cliente: vine.object({
      tipo_doc: vine.enum(TIPOS_DOC_IDENTIDAD),
      num_doc: vine.string().trim().maxLength(15),
      razon_social: vine.string().trim().maxLength(255),
      direccion: vine.string().trim().maxLength(500).nullable().optional(),
    }),
    items: vine
      .array(
        vine.object({
          codigo: vine.string().trim().maxLength(30).optional(),
          descripcion: vine.string().trim().maxLength(500),
          unidad: vine.string().trim().maxLength(3),
          cantidad: vine.number().positive(),
          precio_unitario: vine.number().min(0),
          tip_afe_igv: vine.string().regex(/^\d{2}$/),
        })
      )
      .minLength(1),
  })
)

export const listarComprobantesValidator = vine.compile(
  vine.object({
    pagina: vine.number().positive().optional(),
    por_pagina: vine.number().range([5, 100]).optional(),
    estado: vine.string().optional(), // lista separada por comas
    tipo_documento: vine.string().optional(),
    buscar: vine.string().trim().maxLength(100).optional(),
    fecha_desde: vine
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    fecha_hasta: vine
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    sucursal_id: vine.number().positive().optional(),
    serie: vine.string().trim().toUpperCase().maxLength(4).optional(),
    moneda: vine.enum(['PEN', 'USD'] as const).optional(),
    ordenar: vine
      .enum(['tipo', 'numero', 'cliente', 'total', 'estado', 'emision', 'envio'] as const)
      .optional(),
    direccion: vine.enum(['asc', 'desc'] as const).optional(),
  })
)

export const formatoImpresionValidator = vine.compile(
  vine.object({ formato: vine.enum(FORMATOS_IMPRESION).optional() })
)
