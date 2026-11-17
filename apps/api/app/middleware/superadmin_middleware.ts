import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/** Solo el SuperAdmin de la plataforma puede pasar (rutas /admin). */
export default class SuperadminMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    if (!ctx.auth.getUserOrFail().esSuperadmin) {
      return ctx.response.forbidden({ mensaje: 'Solo el SuperAdmin de la plataforma.' })
    }
    return next()
  }
}
