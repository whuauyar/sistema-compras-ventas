import type { HttpContext } from '@adonisjs/core/http'
import '#types/http_context'
import { EmpresaService } from '#services/empresa_service'
import { auditarCtx } from '#services/auditoria_service'
import {
  actualizarEmpresaValidator,
  registrarEmpresaValidator,
  vincularEmpresaValidator,
} from '#validators/empresa'

const servicio = new EmpresaService()

function vistaEmpresa(empresa: import('#models/empresa').default) {
  return { ...empresa.serialize(), sunat_api_key: empresa.apiKeyEnmascarada() }
}

export default class EmpresasController {
  /** Alta de empresa nueva en la API SUNAT (multipart con certificado). */
  async registrar({ request, response, auth }: HttpContext) {
    const datos = await request.validateUsing(registrarEmpresaValidator)
    const { empresa, advertencias } = await servicio.registrar(
      {
        ruc: datos.ruc,
        razonSocial: datos.razon_social,
        nombreComercial: datos.nombre_comercial,
        direccion: datos.direccion,
        ubigeo: datos.ubigeo,
        departamento: datos.departamento,
        provincia: datos.provincia,
        distrito: datos.distrito,
        solUser: datos.sol_user,
        solPass: datos.sol_pass,
        entorno: datos.entorno,
        regimen: datos.regimen,
        contrasenaCertificado: datos.contrasena_certificado,
        greClientId: datos.gre_client_id,
        greClientSecret: datos.gre_client_secret,
      },
      datos.certificado,
      auth.getUserOrFail()
    )
    return response.created({ empresa: vistaEmpresa(empresa), advertencias })
  }

  /** Vincula una empresa ya registrada en la API con su api_key/api_secret. */
  async vincular({ request, response, auth }: HttpContext) {
    const datos = await request.validateUsing(vincularEmpresaValidator)
    const { empresa, advertencias } = await servicio.vincular(
      { apiKey: datos.api_key, apiSecret: datos.api_secret },
      auth.getUserOrFail()
    )
    return response.created({ empresa: vistaEmpresa(empresa), advertencias })
  }

  async show(ctx: HttpContext) {
    return vistaEmpresa(ctx.empresa)
  }

  async update(ctx: HttpContext) {
    const datos = await ctx.request.validateUsing(actualizarEmpresaValidator)
    const empresa = ctx.empresa
    const antes = empresa.serialize()
    empresa.merge({
      nombreComercial:
        datos.nombre_comercial === undefined ? empresa.nombreComercial : datos.nombre_comercial,
      formatoImpresion: datos.formato_impresion ?? empresa.formatoImpresion,
      permitirVentaSinStock: datos.permitir_venta_sin_stock ?? empresa.permitirVentaSinStock,
    })
    await empresa.save()
    await auditarCtx(ctx, 'empresa.actualizar', 'empresa', empresa.id, {
      antes,
      despues: empresa.serialize(),
    })
    return vistaEmpresa(empresa)
  }
}
