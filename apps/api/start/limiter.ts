/*
|--------------------------------------------------------------------------
| Límites de solicitudes (anti fuerza bruta y abuso)
|--------------------------------------------------------------------------
| - acceso: login/registro por IP + correo → 10/min, bloqueo de 15 min al excederse.
| - api: uso general por usuario autenticado (o IP) → 300/min.
*/

import limiter from '@adonisjs/limiter/services/main'
import env from '#start/env'

export const limiteAcceso = limiter.define('acceso', (ctx) => {
  const email = String(ctx.request.input('email', '')).toLowerCase().trim()
  return limiter
    .allowRequests(env.get('LIMITE_ACCESO_POR_MINUTO', 10))
    .every('1 minute')
    .blockFor('15 mins')
    .usingKey(`acceso_${ctx.request.ip()}_${email}`)
    .limitExceeded((error) => {
      error
        .setMessage('Demasiados intentos. Espere unos minutos e inténtelo de nuevo.')
        .setStatus(429)
    })
})

export const limiteApi = limiter.define('api', (ctx) => {
  return limiter
    .allowRequests(env.get('LIMITE_API_POR_MINUTO', 300))
    .every('1 minute')
    .usingKey(ctx.auth?.user ? `usuario_${ctx.auth.user.id}` : `ip_${ctx.request.ip()}`)
})
