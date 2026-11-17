import vine from '@vinejs/vine'
import { FORMATOS_IMPRESION } from '#constants/sunat'

const ruc = vine
  .string()
  .trim()
  .regex(/^(10|15|17|20)\d{9}$/)
const ubigeo = vine
  .string()
  .trim()
  .regex(/^\d{6}$/)

export const registrarEmpresaValidator = vine.compile(
  vine.object({
    ruc,
    razon_social: vine.string().trim().maxLength(255),
    nombre_comercial: vine.string().trim().maxLength(255).optional(),
    direccion: vine.string().trim().maxLength(500),
    ubigeo,
    departamento: vine.string().trim().maxLength(100).optional(),
    provincia: vine.string().trim().maxLength(100).optional(),
    distrito: vine.string().trim().maxLength(100).optional(),
    sol_user: vine.string().trim().maxLength(20),
    sol_pass: vine.string().maxLength(50),
    entorno: vine.enum(['beta', 'production'] as const),
    regimen: vine.enum(['general', 'mype', 'rer', 'rus'] as const),
    // La API acepta certificados de hasta 100 KB
    certificado: vine.file({ size: '100kb', extnames: ['pfx', 'p12', 'pem', 'cer', 'crt'] }),
    contrasena_certificado: vine.string().maxLength(100).optional(),
    gre_client_id: vine.string().trim().maxLength(100).optional(),
    gre_client_secret: vine.string().maxLength(200).optional(),
  })
)

export const vincularEmpresaValidator = vine.compile(
  vine.object({
    api_key: vine.string().trim().minLength(8).maxLength(200),
    api_secret: vine.string().trim().minLength(8).maxLength(300),
  })
)

export const actualizarEmpresaValidator = vine.compile(
  vine.object({
    nombre_comercial: vine.string().trim().maxLength(255).nullable().optional(),
    formato_impresion: vine.enum(FORMATOS_IMPRESION).optional(),
    permitir_venta_sin_stock: vine.boolean().optional(),
  })
)

export const sucursalValidator = vine.compile(
  vine.object({
    nombre: vine.string().trim().maxLength(100),
    cod_local: vine
      .string()
      .trim()
      .regex(/^\d{4}$/),
    direccion: vine.string().trim().maxLength(500),
    ubigeo,
    formato_impresion: vine.enum(FORMATOS_IMPRESION).nullable().optional(),
    activo: vine.boolean().optional(),
  })
)

export const serieValidator = vine.compile(
  vine.object({
    tipo_documento: vine.enum(['01', '03', '07', '08', '09', '31'] as const),
    serie: vine
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z][A-Z0-9]{3}$/),
    sucursal_id: vine.number().positive(),
    correlativo_inicial: vine.number().min(0).optional(),
  })
)
