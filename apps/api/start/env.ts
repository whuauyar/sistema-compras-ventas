/*
|--------------------------------------------------------------------------
| Variables de entorno (validadas al arrancar)
|--------------------------------------------------------------------------
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  APP_KEY: Env.schema.string(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),

  /* Base de datos: DATABASE_URL (Railway) o DB_* (local) */
  DATABASE_URL: Env.schema.string.optional(),
  DB_HOST: Env.schema.string.optional({ format: 'host' }),
  DB_PORT: Env.schema.number.optional(),
  DB_USER: Env.schema.string.optional(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_DATABASE: Env.schema.string.optional(),

  /* Seguridad e integración SUNAT */
  ENCRYPTION_KEY: Env.schema.string(),
  SUNAT_API_BASE_URL: Env.schema.string(),
  SUNAT_API_TIMEOUT_MS: Env.schema.number.optional(),
  CORS_ORIGINS: Env.schema.string.optional(),
})
