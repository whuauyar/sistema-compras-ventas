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

const camposRegistro = {
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
}

const camposVinculo = {
  api_key: vine.string().trim().minLength(8).maxLength(200),
  api_secret: vine.string().trim().minLength(8).maxLength(300),
}

/** Usuario que quedará como Administrador de la empresa (lo indica el SuperAdmin). */
const camposAdministrador = {
  admin_nombre: vine.string().trim().minLength(3).maxLength(150),
  admin_email: vine.string().trim().email().normalizeEmail().maxLength(254),
  // Obligatoria solo si el correo aún no existe en el sistema
  admin_password: vine.string().minLength(8).maxLength(100).optional(),
}

export const registrarEmpresaValidator = vine.compile(
  vine.object({ ...camposRegistro, ...camposAdministrador })
)

export const vincularEmpresaValidator = vine.compile(
  vine.object({ ...camposVinculo, ...camposAdministrador })
)

export const estadoEmpresaValidator = vine.compile(vine.object({ activo: vine.boolean() }))

export const permisosEmpresaValidator = vine.compile(
  vine.object({ permisos: vine.array(vine.string().trim()).distinct() })
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

const textoOpcional = (max: number) => vine.string().trim().maxLength(max).nullable().optional()

/** Configuración de la empresa que se reenvía a PUT /empresa de la API SUNAT. */
export const configuracionSunatValidator = vine.compile(
  vine.object({
    // Datos fiscales
    razon_social: vine.string().trim().minLength(3).maxLength(255).optional(),
    nombre_comercial: textoOpcional(255),
    direccion: vine.string().trim().minLength(3).maxLength(500).optional(),
    ubigeo: ubigeo.optional(),
    departamento: vine.string().trim().maxLength(100).optional(),
    provincia: vine.string().trim().maxLength(100).optional(),
    distrito: vine.string().trim().maxLength(100).optional(),
    tax_regime: vine.enum(['general', 'mype', 'rer', 'rus'] as const).optional(),
    nrus_categoria: vine
      .enum([1, 2] as const)
      .nullable()
      .optional(),
    igv_rate_override: vine.number().min(0).max(30).nullable().optional(),
    // Credenciales SUNAT (solo escritura)
    sol_user: vine.string().trim().minLength(3).maxLength(50).optional(),
    sol_pass: vine.string().minLength(3).maxLength(50).optional(),
    client_id: vine.string().trim().maxLength(100).optional(),
    client_secret: vine.string().maxLength(255).optional(),
    entorno: vine.enum(['beta', 'production'] as const).optional(),
    confirmar_produccion: vine.boolean().optional(),
    // Datos que se imprimen en los comprobantes
    telefonos: vine.array(vine.string().trim().maxLength(20)).maxLength(5).optional(),
    emails: vine.array(vine.string().trim().email().maxLength(100)).maxLength(5).optional(),
    cuentas_bancarias: vine
      .array(
        vine.object({
          banco: vine.string().trim().maxLength(50),
          tipo_cuenta: vine.string().trim().maxLength(30),
          moneda: vine.enum(['PEN', 'USD'] as const),
          numero: vine.string().trim().maxLength(30),
          cci: textoOpcional(25),
          titular: textoOpcional(100),
        })
      )
      .maxLength(5)
      .optional(),
    billeteras_digitales: vine
      .array(
        vine.object({
          tipo: vine.enum(['yape', 'plin', 'tunki', 'otro'] as const),
          numero: vine.string().trim().maxLength(20),
          titular: textoOpcional(100),
        })
      )
      .maxLength(5)
      .optional(),
    mensaje_agradecimiento: textoOpcional(500),
    mensaje_promocional: textoOpcional(500),
  })
)

export const certificadoValidator = vine.compile(
  vine.object({
    certificado: vine.file({ size: '100kb', extnames: ['pfx', 'p12', 'pem', 'cer', 'crt'] }),
    contrasena_certificado: vine.string().maxLength(100).optional(),
  })
)

export const logoValidator = vine.compile(
  vine.object({
    logo: vine.file({ size: '2mb', extnames: ['jpg', 'jpeg', 'png', 'webp'] }),
  })
)

export const ubigeoQueryValidator = vine.compile(
  vine.object({
    region_id: vine
      .string()
      .regex(/^\d{2}$/)
      .optional(),
    provincia_id: vine
      .string()
      .regex(/^\d{4}$/)
      .optional(),
  })
)

export const actualizarSerieValidator = vine.compile(vine.object({ activo: vine.boolean() }))
