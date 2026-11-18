import env from '#start/env'
import { defineConfig } from '@adonisjs/cors'

const origenes = (env.get('CORS_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

const corsConfig = defineConfig({
  enabled: true,
  // Sin CORS_ORIGINS se permite cualquier origen (solo recomendable en desarrollo)
  origin: origenes.length > 0 ? origenes : true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  headers: true,
  exposeHeaders: ['content-disposition', 'x-formato-impresion'],
  credentials: true,
  maxAge: 90,
})

export default corsConfig
