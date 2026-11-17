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

test.group('Endurecimiento', () => {
  test('cabeceras de seguridad en todas las respuestas', async ({ client }) => {
    const r = await client.get('/health')
    r.assertHeader('x-content-type-options', 'nosniff')
    r.assertHeader('x-frame-options', 'DENY')
    r.assertHeader('referrer-policy', 'no-referrer')
  })

  test('bloquea el login tras demasiados intentos para la misma cuenta', async ({ client, assert }) => {
    const email = `fuerza-bruta-${Date.now()}@prueba.pe`
    for (let i = 0; i < 10; i++) {
      const r = await client.post('/api/v1/auth/login').json({ email, password: 'mala' })
      r.assertStatus(400)
    }
    const bloqueado = await client.post('/api/v1/auth/login').json({ email, password: 'mala' })
    bloqueado.assertStatus(429)
    assert.include(bloqueado.body().mensaje, 'Demasiados intentos')
    assert.isAbove(Number(bloqueado.header('retry-after')), 0)
    // Otra cuenta desde la misma IP no queda bloqueada
    const otra = await client.post('/api/v1/auth/login').json({ email: `otra-${email}`, password: 'mala' })
    otra.assertStatus(400)
  })
})
