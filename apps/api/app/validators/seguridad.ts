import vine from '@vinejs/vine'

export const rolValidator = vine.compile(
  vine.object({
    nombre: vine.string().trim().minLength(2).maxLength(60),
    descripcion: vine.string().trim().maxLength(200).nullable().optional(),
    permisos: vine.array(vine.string().trim()).distinct(),
  })
)

export const crearUsuarioEmpresaValidator = vine.compile(
  vine.object({
    nombre_completo: vine.string().trim().minLength(3).maxLength(150),
    email: vine.string().trim().email().normalizeEmail(),
    // Obligatoria solo si el usuario aún no existe en el sistema
    password: vine.string().minLength(8).maxLength(100).optional(),
    rol_id: vine.number().positive(),
    sucursal_ids: vine.array(vine.number().positive()).optional(),
  })
)

export const actualizarUsuarioEmpresaValidator = vine.compile(
  vine.object({
    rol_id: vine.number().positive().optional(),
    activo: vine.boolean().optional(),
    sucursal_ids: vine.array(vine.number().positive()).optional(),
  })
)
