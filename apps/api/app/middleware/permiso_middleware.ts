import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import '#types/http_context'

/**
 * Exige que el rol del usuario en la empresa activa tenga TODOS los permisos indicados.
 * Un elemento con "|" se cumple con CUALQUIERA de sus alternativas.
 * Uso: .use(middleware.permiso(['config.roles'])) · .use(middleware.permiso(['ventas.crear|clientes.gestionar']))
 */
export default class PermisoMiddleware {
  async handle(ctx: HttpContext, next: NextFn, requeridos: string[]) {
    const faltantes = requeridos.filter((p) => !p.split('|').some((alt) => ctx.permisos?.has(alt)))
    if (faltantes.length > 0) {
      return ctx.response.forbidden({
        mensaje: 'No tiene permiso para esta acción.',
        permisos_faltantes: faltantes,
      })
    }
    return next()
  }
}
