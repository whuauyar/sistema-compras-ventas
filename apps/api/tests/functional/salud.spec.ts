import { test } from '@japa/runner'
import { SunatGateway } from '#integrations/sunat/sunat_service'
import { SunatClient } from '#integrations/sunat/sunat_client'

test.group('Salud y configuración', () => {
  test('health responde ok con base de datos', async ({ client }) => {
    const r = await client.get('/health')
    r.assertStatus(200)
    r.assertBody({ estado: 'ok' })
  })

  test('el gateway crea un único cliente SUNAT desde variables de entorno', ({ assert }) => {
    SunatGateway.usar(null)
    const primero = SunatGateway.cliente()
    assert.instanceOf(primero, SunatClient)
    assert.strictEqual(SunatGateway.cliente(), primero)
    SunatGateway.usar(null)
  })
})
