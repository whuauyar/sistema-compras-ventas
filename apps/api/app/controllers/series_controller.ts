import type { HttpContext } from '@adonisjs/core/http'
import '#types/http_context'
import Serie from '#models/serie'
import Sucursal from '#models/sucursal'
import { SunatGateway } from '#integrations/sunat/sunat_service'
import { serieValidator } from '#validators/empresa'
import { validarSerie } from '#domain/reglas_comprobante'
import { ReglaNegocioError } from '#exceptions/regla_negocio_error'
import { auditarCtx } from '#services/auditoria_service'

export default class SeriesController {
  async index({ empresa }: HttpContext) {
    return Serie.query().where('empresa_id', empresa.id).orderBy(['tipo_documento', 'serie'])
  }

  async store(ctx: HttpContext) {
    const datos = await ctx.request.validateUsing(serieValidator)
    const error = validarSerie(datos.tipo_documento, datos.serie)
    if (error) throw new ReglaNegocioError(error.mensaje, [error])

    const sucursal = await Sucursal.query()
      .where({ id: datos.sucursal_id, empresaId: ctx.empresa.id })
      .firstOrFail()
    if (await Serie.query().where({ empresaId: ctx.empresa.id, serie: datos.serie }).first()) {
      throw new ReglaNegocioError('La serie ya existe.', [
        { campo: 'serie', mensaje: 'Serie duplicada.' },
      ])
    }

    const resultado = await SunatGateway.cliente().crearSerie(ctx.empresa.credenciales(), {
      tipoDocumento: datos.tipo_documento,
      serie: datos.serie,
      sunatSucursalId: sucursal.sunatSucursalId,
      correlativoInicial: datos.correlativo_inicial,
    })
    const serie = await Serie.create({
      empresaId: ctx.empresa.id,
      sucursalId: sucursal.id,
      tipoDocumento: datos.tipo_documento,
      serie: datos.serie,
      sunatSerieId: resultado.creadas?.[0]?.id ?? null,
      activo: true,
    })
    await auditarCtx(ctx, 'serie.crear', 'serie', serie.id, { despues: serie.serialize() })
    return ctx.response.created(serie)
  }
}
