import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * Worker de la cola PostgreSQL. En Railway corre como servicio aparte:
 *   node ace jobs:work
 */
export default class JobsWork extends BaseCommand {
  static commandName = 'jobs:work'
  static description = 'Procesa la cola de trabajos (envíos y reconsultas SUNAT)'
  static options: CommandOptions = { startApp: true, staysAlive: true }

  @flags.number({ description: 'Segundos entre sondeos cuando la cola está vacía', default: 3 })
  declare intervalo: number

  @flags.boolean({ description: 'Procesa un lote y termina (útil en pruebas)' })
  declare unaVez: boolean

  private detener = false

  async run() {
    const { registrarJobsSunat, programarReconsultas } = await import('#jobs/sunat_jobs')
    const { procesarLote } = await import('#services/cola_service')
    registrarJobsSunat()

    this.app.terminating(() => {
      this.detener = true
    })

    const DIEZ_MINUTOS = 10 * 60 * 1000
    let ultimaProgramacion = 0
    this.logger.info('Worker de cola iniciado')

    while (!this.detener) {
      if (Date.now() - ultimaProgramacion > DIEZ_MINUTOS) {
        const encolados = await programarReconsultas()
        if (encolados > 0) this.logger.info(`Reconsultas programadas: ${encolados}`)
        ultimaProgramacion = Date.now()
      }
      const procesados = await procesarLote(10)
      if (this.unaVez) break
      if (procesados === 0) await new Promise((r) => setTimeout(r, this.intervalo * 1000))
    }
    await this.terminate()
  }
}
