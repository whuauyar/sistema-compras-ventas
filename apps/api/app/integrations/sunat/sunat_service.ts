import env from '#start/env'
import { SunatClient } from './sunat_client.js'

/**
 * Fábrica del cliente SUNAT. En tests se reemplaza con `SunatGateway.usar(clienteFalso)`.
 */
export class SunatGateway {
  private static instancia: SunatClient | null = null

  static cliente(): SunatClient {
    if (!this.instancia) {
      this.instancia = new SunatClient({
        baseUrl: env.get('SUNAT_API_BASE_URL'),
        timeoutMs: env.get('SUNAT_API_TIMEOUT_MS', 45_000),
      })
    }
    return this.instancia
  }

  static usar(cliente: SunatClient | null) {
    this.instancia = cliente
  }
}
