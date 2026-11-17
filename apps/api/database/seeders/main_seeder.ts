import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { sincronizarCatalogoPermisos } from '#services/permisos_service'

/** Sincroniza el catálogo de permisos. Seguro de correr en cada despliegue. */
export default class MainSeeder extends BaseSeeder {
  async run() {
    await sincronizarCatalogoPermisos()
  }
}
