import type { HttpContext } from '@adonisjs/core/http'
import '#types/http_context'
import { auditarCtx } from '#services/auditoria_service'
import { ConfiguracionSunatService, sinSecretos } from '#services/configuracion_sunat_service'
import { ReglaNegocioError } from '#exceptions/regla_negocio_error'
import {
  certificadoValidator,
  configuracionSunatValidator,
  logoValidator,
} from '#validators/empresa'

const servicio = new ConfiguracionSunatService()

/** Configuración integral de la empresa en la API SUNAT (datos fiscales, credenciales, certificado…). */
export default class ConfiguracionSunatController {
  async show(ctx: HttpContext) {
    return servicio.obtener(ctx.empresa)
  }

  async update(ctx: HttpContext) {
    const { confirmar_produccion: confirmar, ...cambios } = await ctx.request.validateUsing(
      configuracionSunatValidator
    )
    if (cambios.entorno === 'production' && ctx.empresa.entorno !== 'production' && !confirmar) {
      throw new ReglaNegocioError(
        'Pasar a producción emite comprobantes con validez legal. Confirme el cambio.',
        [{ campo: 'confirmar_produccion', mensaje: 'Confirmación requerida.' }]
      )
    }
    const remota = await servicio.actualizar(ctx.empresa, cambios)
    await auditarCtx(ctx, 'empresa.configuracion_sunat', 'empresa', ctx.empresa.id, {
      despues: sinSecretos(cambios),
    })
    return remota
  }

  async certificado(ctx: HttpContext) {
    const datos = await ctx.request.validateUsing(certificadoValidator)
    await servicio.subirCertificado(ctx.empresa, datos.certificado, datos.contrasena_certificado)
    await auditarCtx(ctx, 'empresa.certificado', 'empresa', ctx.empresa.id, {
      despues: { archivo: datos.certificado.clientName },
    })
    return { mensaje: 'Certificado actualizado.' }
  }

  async logo(ctx: HttpContext) {
    const { logo } = await ctx.request.validateUsing(logoValidator)
    const url = await servicio.subirLogo(ctx.empresa, logo)
    await auditarCtx(ctx, 'empresa.logo', 'empresa', ctx.empresa.id, { despues: { logo_url: url } })
    return { logo_url: url }
  }

  async regenerarCredenciales(ctx: HttpContext) {
    const apiKey = await servicio.regenerarCredenciales(ctx.empresa)
    await auditarCtx(ctx, 'empresa.credenciales_api', 'empresa', ctx.empresa.id, {
      despues: { sunat_api_key: apiKey },
    })
    return { sunat_api_key: apiKey, mensaje: 'Credenciales de la API renovadas y guardadas.' }
  }

  async sincronizar(ctx: HttpContext) {
    return servicio.sincronizar(ctx.empresa)
  }
}
