import vine from '@vinejs/vine'

const fecha = () => vine.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const ubigeo = () =>
  vine
    .string()
    .trim()
    .regex(/^\d{6}$/)

export const notaCreditoValidator = vine.compile(
  vine.object({
    cod_motivo: vine.string().regex(/^\d{2}$/),
    des_motivo: vine.string().trim().maxLength(250).nullable().optional(),
    reponer_stock: vine.boolean().optional(),
    items: vine
      .array(
        vine.object({
          venta_item_id: vine.number().positive().optional(),
          indice: vine.number().min(0).optional(),
          cantidad: vine.number().positive(),
        })
      )
      .optional(),
  })
)

export const notaDebitoValidator = vine.compile(
  vine.object({
    cod_motivo: vine.string().regex(/^\d{2}$/),
    des_motivo: vine.string().trim().maxLength(250).nullable().optional(),
    items: vine
      .array(
        vine.object({
          descripcion: vine.string().trim().minLength(2).maxLength(500),
          unidad: vine.string().trim().maxLength(3).optional(),
          cantidad: vine.number().positive(),
          precio_unitario: vine.number().positive(),
          tip_afe_igv: vine
            .string()
            .regex(/^\d{2}$/)
            .optional(),
        })
      )
      .minLength(1),
  })
)

export const guiaValidator = vine.compile(
  vine.object({
    serie: vine.string().trim().toUpperCase().optional(),
    venta_id: vine.number().positive().nullable().optional(),
    destinatario: vine.object({
      tipo_doc: vine.enum(['1', '6'] as const),
      num_doc: vine
        .string()
        .trim()
        .regex(/^\d{8}(\d{3})?$/),
      razon_social: vine.string().trim().maxLength(255),
    }),
    cod_traslado: vine.string().regex(/^\d{2}$/),
    mod_traslado: vine.enum(['01', '02'] as const),
    fecha_traslado: fecha(),
    fecha_entrega_transportista: fecha().nullable().optional(),
    peso_total: vine.number().positive(),
    num_bultos: vine.number().positive().nullable().optional(),
    partida: vine.object({ ubigeo: ubigeo(), direccion: vine.string().trim().maxLength(500) }),
    llegada: vine.object({ ubigeo: ubigeo(), direccion: vine.string().trim().maxLength(500) }),
    transportista: vine
      .object({
        tipo_doc: vine.string().trim().maxLength(1),
        num_doc: vine.string().trim().maxLength(15),
        razon_social: vine.string().trim().maxLength(255),
        nro_mtc: vine.string().trim().maxLength(20).nullable().optional(),
      })
      .nullable()
      .optional(),
    vehiculo: vine
      .object({
        placa: vine
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z0-9-]{5,8}$/),
      })
      .nullable()
      .optional(),
    conductor: vine
      .object({
        tipo_doc: vine.string().trim().maxLength(1),
        num_doc: vine.string().trim().maxLength(15),
        licencia: vine.string().trim().maxLength(20),
        nombres: vine.string().trim().maxLength(100),
        apellidos: vine.string().trim().maxLength(100),
      })
      .nullable()
      .optional(),
    items: vine
      .array(
        vine.object({
          codigo: vine.string().trim().maxLength(30).optional(),
          descripcion: vine.string().trim().maxLength(500),
          cantidad: vine.number().positive(),
          unidad: vine.string().trim().maxLength(3).optional(),
        })
      )
      .optional(),
    observacion: vine.string().trim().maxLength(500).nullable().optional(),
  })
)

export const anulacionValidator = vine.compile(
  vine.object({
    comprobante_ids: vine.array(vine.number().positive()).minLength(1).maxLength(100).distinct(),
    motivo: vine.string().trim().minLength(3).maxLength(255),
  })
)
