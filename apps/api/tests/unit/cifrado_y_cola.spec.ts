import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import { cifrar, descifrar } from '#services/cifrado_service'
import {
  ReintentarMasTarde,
  encolar,
  esperaReintento,
  procesarLote,
  registrarManejador,
} from '#services/cola_service'
import Job from '#models/job'

test.group('Cifrado de credenciales', () => {
  test('cifra y descifra sin dejar el texto plano', ({ assert }) => {
    const cifrado = cifrar('mi-secreto')
    assert.notInclude(cifrado, 'mi-secreto')
    assert.equal(descifrar(cifrado), 'mi-secreto')
  })

  test('falla con un dato manipulado', ({ assert }) => {
    assert.throws(() => descifrar('dato-invalido'), /No se pudo descifrar/)
  })
})

test.group('Cola de trabajos', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('espera exponencial con tope', ({ assert }) => {
    assert.equal(esperaReintento(1), 30)
    assert.equal(esperaReintento(2), 60)
    assert.equal(esperaReintento(20), 1800)
  })

  test('procesa un trabajo disponible y lo marca completado', async ({ assert }) => {
    const vistos: unknown[] = []
    registrarManejador('prueba.ok', async (payload) => {
      vistos.push(payload.valor)
    })
    const job = await encolar('prueba.ok', { valor: 42 })
    assert.equal(await procesarLote(), 1)
    await job.refresh()
    assert.equal(job.estado, 'completado')
    assert.deepEqual(vistos, [42])
  })

  test('no toma trabajos programados a futuro', async ({ assert }) => {
    await encolar('prueba.ok', {}, { retrasoSeg: 600 })
    assert.equal(await procesarLote(), 0)
  })

  test('reprograma ante error y marca fallido al agotar intentos', async ({ assert }) => {
    registrarManejador('prueba.falla', async () => {
      throw new Error('boom')
    })
    const job = await encolar('prueba.falla', {}, { maxIntentos: 2 })
    await procesarLote()
    await job.refresh()
    assert.equal(job.estado, 'pendiente')
    assert.equal(job.ultimoError, 'boom')
    assert.isTrue(job.disponibleEn > DateTime.now())

    job.disponibleEn = DateTime.now().minus({ seconds: 1 })
    await job.save()
    await procesarLote()
    await job.refresh()
    assert.equal(job.estado, 'fallido')
  })

  test('ReintentarMasTarde reprograma con la espera indicada', async ({ assert }) => {
    registrarManejador('prueba.luego', async () => {
      throw new ReintentarMasTarde(300)
    })
    const job = await encolar('prueba.luego', {})
    await procesarLote()
    await job.refresh()
    assert.equal(job.estado, 'pendiente')
    assert.isTrue(job.disponibleEn > DateTime.now().plus({ seconds: 250 }))
  })

  test('falla si no hay manejador registrado', async ({ assert }) => {
    const job = await encolar('prueba.desconocido', {}, { maxIntentos: 1 })
    await procesarLote()
    const actualizado = await Job.findOrFail(job.id)
    assert.equal(actualizado.estado, 'fallido')
    assert.include(actualizado.ultimoError!, 'No hay manejador')
  })
})
