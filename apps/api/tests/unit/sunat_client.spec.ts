import { test } from '@japa/runner'
import { SunatClient } from '#integrations/sunat/sunat_client'
import { SunatApiError, mensajeAmigable } from '#integrations/sunat/sunat_errors'
import { SunatFalsa, exito } from '#tests/helpers'

const cred = { apiKey: 'clave', apiSecret: 'secreto' }
const crear = (falsa: SunatFalsa, extra = {}) =>
  new SunatClient({
    baseUrl: 'http://sunat.falsa/api/v1/',
    fetchImpl: falsa.fetch as any,
    esperar: async () => {},
    ...extra,
  })

test.group('Cliente SUNAT', () => {
  test('envía cabeceras de autenticación e Idempotency-Key y desenvuelve datos', async ({
    assert,
  }) => {
    const falsa = new SunatFalsa().cuando('POST /boletas', exito({ id: 7 }, 201))
    const datos = await crear(falsa).emitir(cred, '03', { serie: 'B001' }, 'uuid-1')
    assert.deepEqual(datos, { id: 7 })
    const llamada = falsa.llamadas[0]
    assert.equal(llamada.headers['X-Api-Key'], 'clave')
    assert.equal(llamada.headers['X-Api-Secret'], 'secreto')
    assert.equal(llamada.headers['Idempotency-Key'], 'uuid-1')
    assert.deepEqual(llamada.cuerpo, { serie: 'B001' })
  })

  test('reintenta ante 5xx y luego tiene éxito', async ({ assert }) => {
    const falsa = new SunatFalsa().cuando(
      'GET /facturas/1',
      { status: 503, cuerpo: { estado: 'error' } },
      exito({ id: 1 })
    )
    const datos = await crear(falsa).obtenerComprobante(cred, '01', 1)
    assert.deepEqual(datos, { id: 1 })
    assert.lengthOf(falsa.llamadas, 2)
  })

  test('reintenta ante error de red y se rinde tras agotar intentos', async ({ assert }) => {
    const falsa = new SunatFalsa().cuando('GET /empresa', { error: new TypeError('fetch failed') })
    const error = await crear(falsa, { reintentos: 2 })
      .obtenerEmpresa(cred)
      .catch((e) => e)
    assert.instanceOf(error, SunatApiError)
    assert.equal(error.status, 0)
    assert.isTrue(error.esReintentable)
    assert.lengthOf(falsa.llamadas, 3)
  })

  test('NO reintenta errores 422 y conserva el detalle', async ({ assert }) => {
    const falsa = new SunatFalsa().cuando('POST /facturas', {
      status: 422,
      cuerpo: {
        estado: 'error',
        mensaje: 'Error de validación',
        errores: { 'cliente.tipo_doc': ['Requiere RUC'] },
      },
    })
    const error: SunatApiError = await crear(falsa)
      .emitir(cred, '01', {}, 'k')
      .catch((e) => e)
    assert.equal(error.status, 422)
    assert.deepEqual(error.errores, { 'cliente.tipo_doc': ['Requiere RUC'] })
    assert.isFalse(error.esReintentable)
    assert.lengthOf(falsa.llamadas, 1)
    assert.equal(error.toJSON().origen, 'sunat_api')
  })

  test('un 200 con estado error se trata como 422', async ({ assert }) => {
    const falsa = new SunatFalsa().cuando('GET /empresa', {
      status: 200,
      cuerpo: { estado: 'error', mensaje: 'x' },
    })
    const error: SunatApiError = await crear(falsa)
      .obtenerEmpresa(cred)
      .catch((e) => e)
    assert.equal(error.status, 422)
  })

  test('cuerpo no JSON produce mensaje legible', async ({ assert }) => {
    const falsa = { fetch: async () => new Response('<html>Bad gateway</html>', { status: 502 }) }
    const cliente = new SunatClient({
      baseUrl: 'http://x/api/v1',
      fetchImpl: falsa.fetch as any,
      esperar: async () => {},
      reintentos: 0,
    })
    const error: SunatApiError = await cliente.obtenerEmpresa(cred).catch((e) => e)
    assert.equal(error.status, 502)
    assert.equal((error.cuerpo as any).mensaje, '<html>Bad gateway</html>')
  })

  test('respuesta vacía no rompe el cliente', async ({ assert }) => {
    const falsa = { fetch: async () => new Response('', { status: 500 }) }
    const cliente = new SunatClient({
      baseUrl: 'http://x/api/v1',
      fetchImpl: falsa.fetch as any,
      esperar: async () => {},
      reintentos: 0,
    })
    const error: SunatApiError = await cliente.obtenerEmpresa(cred).catch((e) => e)
    assert.equal(error.status, 500)
  })

  test('descarga PDF con formato y devuelve la respuesta cruda', async ({ assert }) => {
    const falsa = new SunatFalsa().cuando('GET /boletas/9/pdf', { binario: '%PDF-1.4' })
    const respuesta = await crear(falsa).descargar(cred, '03', 9, 'pdf', 'ticket-80')
    assert.equal(await respuesta.text(), '%PDF-1.4')
    assert.equal(falsa.llamadas[0].ruta, '/boletas/9/pdf?format=ticket-80')
  })

  test('arma payloads de series, sucursales, búsqueda, reenvío y registro', async ({ assert }) => {
    const falsa = new SunatFalsa()
      .cuando('POST /series', exito({ creadas: [{ id: 3, serie: 'FC01' }] }, 201))
      .cuando('POST /sucursales', exito({ id: 4 }, 201))
      .cuando('GET /sucursales', exito([]))
      .cuando('POST /series/init-defaults', exito([]))
      .cuando('GET /buscar-documento', exito({ razon_social: 'ACME' }))
      .cuando('POST /notas-credito/5/reenviar', exito({ id: 5 }))
      .cuando('PUT /empresa', exito({ ok: true }))
      .cuando('POST /registro', exito({ api_key: 'k', api_secret: 's' }, 201))
    const c = crear(falsa)
    await c.crearSerie(cred, { tipoDocumento: '07', serie: 'FC01', sunatSucursalId: 2 })
    await c.crearSucursal(cred, {
      nombre: 'S',
      cod_local: '0001',
      direccion: 'D',
      ubigeo: '150101',
    })
    await c.listarSucursales(cred)
    await c.inicializarSeries(cred, { serie_factura: 'F001', serie_boleta: 'B001' })
    await c.buscarDocumento(cred, '6', '20512345678')
    await c.reenviar(cred, '07', 5)
    await c.actualizarEmpresa(cred, { nombre_comercial: 'X' })
    const form = new FormData()
    form.append('ruc', '20512345678')
    const registro = await c.registrarEmpresa(form)
    assert.equal(registro.api_secret, 's')
    assert.deepEqual(falsa.llamadas[0].cuerpo, {
      tipo: 'nota_credito',
      serie: 'FC01',
      sucursal_id: 2,
      correlativo_inicial: 0,
    })
    assert.equal(falsa.llamadas[4].ruta, '/buscar-documento?tipo=6&numero=20512345678')
    assert.isUndefined(falsa.llamadas[7].headers['X-Api-Key'])
  })

  test('usa fetch y espera por defecto cuando no se inyectan', async ({ assert }) => {
    const original = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ estado: 'exito', datos: 1 }))) as any
    try {
      const cliente = new SunatClient({ baseUrl: 'http://x/api/v1' })
      assert.equal(await cliente.obtenerEmpresa(cred), 1)
    } finally {
      globalThis.fetch = original
    }
  })

  test('mensajes amigables por código de error', ({ assert }) => {
    assert.include(mensajeAmigable(0, null, ''), 'No se pudo conectar')
    assert.include(mensajeAmigable(401, null, ''), 'credenciales')
    assert.include(mensajeAmigable(403, 'subscription_expired', ''), 'suscripción')
    assert.include(mensajeAmigable(429, 'limit_reached', ''), 'límite')
    assert.equal(mensajeAmigable(422, null, 'Detalle'), 'Detalle')
    assert.equal(mensajeAmigable(500, null, ''), 'Error en el servicio de facturación.')
  })
})
