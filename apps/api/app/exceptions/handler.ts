import app from '@adonisjs/core/services/app'
import { HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import { errors } from '@vinejs/vine'
import { errors as erroresLimite } from '@adonisjs/limiter'
import { SunatApiError } from '#integrations/sunat/sunat_errors'
import { ReglaNegocioError } from '#exceptions/regla_negocio_error'

/** Estado HTTP que devolvemos al frontend ante un error de la API SUNAT. */
export function estadoParaErrorSunat(error: SunatApiError): number {
  // Red/5xx → 502. 401/403 de la API → 424 para no confundirlo con la sesión del usuario.
  if (error.esReintentable) return 502
  if (error.status === 401 || error.status === 403) return 424
  return error.status
}

export default class HttpExceptionHandler extends ExceptionHandler {
  protected debug = !app.inProduction

  async handle(error: unknown, ctx: HttpContext) {
    if (error instanceof ReglaNegocioError) {
      return ctx.response
        .status(error.status)
        .send({ mensaje: error.message, errores: error.errores })
    }
    if (error instanceof errors.E_VALIDATION_ERROR) {
      const lista = (error.messages ?? []) as Array<{ field: string; message: string }>
      return ctx.response.status(422).send({
        mensaje: lista[0]?.message ?? 'Datos inválidos.',
        errores: lista.map((e) => ({ campo: e.field, mensaje: e.message })),
      })
    }
    if (error instanceof erroresLimite.E_TOO_MANY_REQUESTS) {
      const reintentarEn = error.response.availableIn
      ctx.response.header('Retry-After', String(reintentarEn))
      return ctx.response.status(429).send({ mensaje: error.message, reintentar_en_segundos: reintentarEn })
    }
    if (error instanceof SunatApiError) {
      return ctx.response.status(estadoParaErrorSunat(error)).send(error.toJSON())
    }
    return super.handle(error, ctx)
  }

  async report(error: unknown, ctx: HttpContext) {
    return super.report(error, ctx)
  }
}
