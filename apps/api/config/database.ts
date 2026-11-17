import env from '#start/env'
import { defineConfig } from '@adonisjs/lucid'
import { BaseModel, SnakeCaseNamingStrategy } from '@adonisjs/lucid/orm'

// La API serializa en snake_case (igual que la API SUNAT y los validadores)
BaseModel.namingStrategy = new SnakeCaseNamingStrategy()

const databaseUrl = env.get('DATABASE_URL')

const dbConfig = defineConfig({
  connection: 'postgres',
  connections: {
    postgres: {
      client: 'pg',
      // Railway entrega DATABASE_URL; en local se usan las variables DB_*
      connection: databaseUrl
        ? { connectionString: databaseUrl }
        : {
            host: env.get('DB_HOST', '127.0.0.1'),
            port: env.get('DB_PORT', 5432),
            user: env.get('DB_USER'),
            password: env.get('DB_PASSWORD'),
            database: env.get('DB_DATABASE'),
          },
      migrations: {
        naturalSort: true,
        paths: ['database/migrations'],
      },
      seeders: {
        paths: ['database/seeders'],
      },
    },
  },
})

export default dbConfig
