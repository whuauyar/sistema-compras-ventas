import type { HttpContext } from '@adonisjs/core/http'
import '#types/http_context'
import { auditarCtx } from '#services/auditoria_service'
import { actualizarEmpresaValidator } from '#validators/empresa'

function vistaEmpresa(empresa: import('#models/empresa').default) {
  return { ...empresa.serialize(), sunat_api_key: empresa.apiKeyEnmascarada() }
}

export default class EmpresasController {
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
