import app from '@adonisjs/core/services/app'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * Cabeceras de seguridad para una API JSON (sin HTML propio):
 * nada se puede incrustar en iframes ni interpretar como otro tipo de contenido.
 */
export default class CabecerasSeguridadMiddleware {
  async handle({ response }: HttpContext, next: NextFn) {
    response.header('X-Content-Type-Options', 'nosniff')
    response.header('X-Frame-Options', 'DENY')
    response.header('Referrer-Policy', 'no-referrer')
    response.header('Cross-Origin-Resource-Policy', 'same-site')
    response.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    if (app.inProduction)
      response.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    return next()
  }
}
