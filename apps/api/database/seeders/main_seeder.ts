import { BaseSeeder } from '@adonisjs/lucid/seeders'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { asegurarPlantillas, sincronizarCatalogoPermisos } from '#services/permisos_service'
import { asegurarSuperadmin } from '#services/superadmin_service'

/**
 * Catálogo de permisos, roles plantilla globales y SuperAdmin (desde SUPERADMIN_*).
 * Seguro de correr en cada despliegue: nunca cambia la contraseña de un usuario existente.
 */
export default class MainSeeder extends BaseSeeder {
  async run() {
    await sincronizarCatalogoPermisos()
    await asegurarPlantillas()
    const resultado = await asegurarSuperadmin({
      email: env.get('SUPERADMIN_EMAIL'),
      password: env.get('SUPERADMIN_PASSWORD'),
      nombre: env.get('SUPERADMIN_NOMBRE'),
    })
    if (resultado === 'sin_password') {
      logger.warn(
        'SUPERADMIN_PASSWORD falta o tiene menos de 12 caracteres: no se creó el SuperAdmin.'
      )
    } else if (resultado !== 'omitido') {
      logger.info(`SuperAdmin: ${resultado}`)
    }
  }
}
