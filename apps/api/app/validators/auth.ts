import vine from '@vinejs/vine'
import { FORMATOS_IMPRESION } from '#constants/sunat'

export const loginValidator = vine.compile(
  vine.object({
    email: vine.string().trim().email().normalizeEmail(),
    password: vine.string(),
  })
)

export const actualizarPerfilValidator = vine.compile(
  vine.object({
    nombre_completo: vine.string().trim().minLength(3).maxLength(150).optional(),
    telefono: vine.string().trim().maxLength(20).nullable().optional(),
    formato_impresion: vine.enum(FORMATOS_IMPRESION).nullable().optional(),
    empresa_predeterminada_id: vine.number().positive().nullable().optional(),
  })
)

export const cambiarPasswordValidator = vine.compile(
  vine.object({
    password_actual: vine.string(),
    password: vine
      .string()
      .minLength(8)
      .maxLength(100)
      .confirmed({ confirmationField: 'password_confirmacion' }),
  })
)
