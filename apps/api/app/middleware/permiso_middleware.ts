import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import '#types/http_context'

/**
 * Exige que el rol del usuario en la empresa activa tenga TODOS los permisos indicados.
 * Uso: .use(middleware.permiso(['config.roles']))
 */
export default class PermisoMiddleware {
  async handle(ctx: HttpContext, next: NextFn, requeridos: string[]) {
    const faltantes = requeridos.filter((p) => !ctx.permisos?.has(p))
    if (faltantes.length > 0) {
      return ctx.response.forbidden({
        mensaje: 'No tiene permiso para esta acción.',
        permisos_faltantes: faltantes,
      })
    }
    return next()
  }
}
