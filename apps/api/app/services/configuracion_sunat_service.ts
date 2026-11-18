import type { MultipartFile } from '@adonisjs/core/bodyparser'
import { readFile } from 'node:fs/promises'
import logger from '@adonisjs/core/services/logger'
import type Empresa from '#models/empresa'
import { SunatGateway } from '#integrations/sunat/sunat_service'
import { ReglaNegocioError } from '#exceptions/regla_negocio_error'

/** Datos de la empresa tal como los devuelve GET/PUT /empresa de la API SUNAT. */
export type EmpresaRemota = Record<string, any>

/** Cambios de configuración que el sistema reenvía a PUT /empresa de la API SUNAT. */
export interface CambiosConfiguracion {
  razon_social?: string
  nombre_comercial?: string | null
  direccion?: string
  ubigeo?: string
  departamento?: string
  provincia?: string
  distrito?: string
  tax_regime?: 'general' | 'mype' | 'rer' | 'rus'
  nrus_categoria?: 1 | 2 | null
  igv_rate_override?: number | null
  sol_user?: string
  sol_pass?: string
  client_id?: string
  client_secret?: string
  entorno?: 'beta' | 'production'
  telefonos?: string[]
  emails?: string[]
  cuentas_bancarias?: Array<{
    banco: string
    tipo_cuenta: string
    moneda: 'PEN' | 'USD'
    numero: string
    cci?: string | null
    titular?: string | null
  }>
  billeteras_digitales?: Array<{
    tipo: 'yape' | 'plin' | 'tunki' | 'otro'
    numero: string
    titular?: string | null
  }>
  mensaje_agradecimiento?: string | null
  mensaje_promocional?: string | null
}

/**
 * La API devuelve la tasa de IGV como porcentaje (18, 10.5); aquí se guarda como fracción (0.18).
 * Acepta ambos por si la API cambia de criterio. Devuelve null si no es un número válido.
 */
export function tasaComoFraccion(valor: unknown): number | null {
  const n = typeof valor === 'string' ? Number(valor) : valor
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return null
  return n > 1 ? Math.round((n / 100) * 10_000) / 10_000 : n
}

/** Campos secretos: nunca se devuelven ni se guardan en la auditoría. */
const SECRETOS = ['sol_pass', 'client_secret'] as const

/** Copia de los cambios sin valores secretos (solo indica que se cambiaron). */
export function sinSecretos(cambios: CambiosConfiguracion) {
  const copia: Record<string, unknown> = { ...cambios }
  for (const clave of SECRETOS) if (clave in copia) copia[clave] = '***'
  return copia
}

/**
 * Configuración de la empresa contra los endpoints de la API SUNAT.
 * La API es la fuente de verdad: este sistema guarda solo un espejo de lo que usa
 * para emitir (razón social, dirección, régimen, entorno, IGV, GRE, logo).
 */
export class ConfiguracionSunatService {
  private cliente() {
    return SunatGateway.cliente()
  }

  /** Configuración remota + disponibilidad del servicio SUNAT (si falla, no bloquea). */
  async obtener(empresa: Empresa) {
    const cred = empresa.credenciales()
    const remota = await this.cliente().obtenerEmpresa(cred)
    let servicio: { disponible: boolean; circuit: string; fallas: number; entorno: string } | null =
      null
    try {
      const estado = await this.cliente().estadoServicio(cred)
      servicio = estado.sunat
    } catch (error) {
      logger.warn({ err: error }, 'No se pudo consultar /sunat/estado')
    }
    await this.reflejar(empresa, remota)
    return { remota: this.vista(remota), servicio }
  }

  /** Envía los cambios a PUT /empresa y actualiza el espejo local con la respuesta. */
  async actualizar(empresa: Empresa, cambios: CambiosConfiguracion) {
    if (cambios.nrus_categoria && cambios.tax_regime && cambios.tax_regime !== 'rus') {
      throw new ReglaNegocioError('La categoría NRUS solo aplica al Nuevo RUS.', [
        { campo: 'nrus_categoria', mensaje: 'Solo para régimen Nuevo RUS.' },
      ])
    }
    const remota = await this.cliente().actualizarEmpresa(empresa.credenciales(), { ...cambios })
    await this.reflejar(empresa, remota)
    return this.vista(remota)
  }

  /** Reemplaza el certificado digital (.pfx/.p12 con contraseña, o .pem/.cer/.crt). */
  async subirCertificado(empresa: Empresa, archivo: MultipartFile, contrasena?: string) {
    const extension = (archivo.extname ?? '').toLowerCase()
    if (['pfx', 'p12'].includes(extension) && !contrasena) {
      throw new ReglaNegocioError('Indique la contraseña del certificado.', [
        { campo: 'contrasena_certificado', mensaje: 'Obligatoria para .pfx/.p12.' },
      ])
    }
    const form = new FormData()
    form.append(
      'certificado',
      new Blob([await readFile(archivo.tmpPath!)]),
      archivo.clientName || `certificado.${extension}`
    )
    if (contrasena) form.append('contrasena_certificado', contrasena)
    await this.cliente().subirCertificado(empresa.credenciales(), form)
  }

  async subirLogo(empresa: Empresa, archivo: MultipartFile) {
    const form = new FormData()
    form.append('logo', new Blob([await readFile(archivo.tmpPath!)]), archivo.clientName)
    const r = await this.cliente().subirLogo(empresa.credenciales(), form)
    empresa.logoUrl = r.logo_url ?? null
    await empresa.save()
    return r.logo_url
  }

  /**
   * Rota api_key/api_secret en la API y guarda las nuevas cifradas aquí mismo.
   * Las anteriores dejan de valer en el acto, por eso se guardan antes de responder.
   */
  async regenerarCredenciales(empresa: Empresa) {
    const nuevas = await this.cliente().regenerarCredenciales(empresa.credenciales())
    empresa.establecerCredenciales(nuevas.api_key, nuevas.api_secret)
    try {
      await empresa.save()
    } catch (error) {
      // Situación crítica: la API ya invalidó las anteriores. Se deja rastro para recuperarlas.
      logger.fatal(
        { err: error, empresaId: empresa.id },
        'Credenciales regeneradas en la API pero NO guardadas localmente'
      )
      throw error
    }
    return empresa.apiKeyEnmascarada()
  }

  /** Vuelve a leer GET /empresa y actualiza el espejo local. */
  async sincronizar(empresa: Empresa) {
    const remota = await this.cliente().obtenerEmpresa(empresa.credenciales())
    await this.reflejar(empresa, remota)
    return this.vista(remota)
  }

  /** Copia al espejo local los datos que se usan al emitir. */
  async reflejar(empresa: Empresa, remota: EmpresaRemota) {
    const regimenes = ['general', 'mype', 'rer', 'rus']
    empresa.merge({
      razonSocial: remota.razon_social ?? empresa.razonSocial,
      nombreComercial: remota.nombre_comercial ?? null,
      direccion: remota.direccion ?? empresa.direccion,
      ubigeo: remota.ubigeo ?? empresa.ubigeo,
      departamento: remota.departamento ?? null,
      provincia: remota.provincia ?? null,
      distrito: remota.distrito ?? null,
      regimen: regimenes.includes(remota.tax_regime) ? remota.tax_regime : empresa.regimen,
      entorno: remota.entorno === 'production' ? 'production' : 'beta',
      greConfigurada: Boolean(remota.client_id && remota.tiene_client_secret),
      logoUrl: remota.logo_url ?? empresa.logoUrl,
      igvTasa: tasaComoFraccion(remota.tasa_igv_vigente) ?? empresa.igvTasa,
    })
    await empresa.save()
  }

  /** Lo que ve el frontend: sin secretos ni identificadores internos de la API. */
  vista(remota: EmpresaRemota) {
    return {
      ruc: remota.ruc,
      razon_social: remota.razon_social,
      nombre_comercial: remota.nombre_comercial ?? null,
      direccion: remota.direccion ?? null,
      ubigeo: remota.ubigeo ?? null,
      departamento: remota.departamento ?? null,
      provincia: remota.provincia ?? null,
      distrito: remota.distrito ?? null,
      tax_regime: remota.tax_regime ?? 'general',
      nrus_categoria: remota.nrus_categoria ?? null,
      igv_rate_override: remota.igv_rate_override ?? null,
      tasa_igv_vigente: tasaComoFraccion(remota.tasa_igv_vigente),
      entorno: remota.entorno ?? 'beta',
      sol_user: remota.sol_user ?? null,
      tiene_sol_pass: Boolean(remota.tiene_sol_pass),
      client_id: remota.client_id ?? null,
      tiene_client_secret: Boolean(remota.tiene_client_secret),
      tiene_certificado: Boolean(remota.tiene_certificado),
      logo_url: remota.logo_url ?? null,
      telefonos: remota.telefonos ?? [],
      emails: remota.emails ?? [],
      cuentas_bancarias: remota.cuentas_bancarias ?? [],
      billeteras_digitales: remota.billeteras_digitales ?? [],
      mensaje_agradecimiento: remota.mensaje_agradecimiento ?? null,
      mensaje_promocional: remota.mensaje_promocional ?? null,
      plan: remota.plan ?? null,
      documentos_este_mes: remota.documentos_este_mes ?? null,
      max_documentos_mes: remota.max_documentos_mes ?? null,
      activo: remota.activo ?? true,
    }
  }
}
