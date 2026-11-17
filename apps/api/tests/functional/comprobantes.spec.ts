import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import Comprobante from '#models/comprobante'
import Empresa from '#models/empresa'
import Job from '#models/job'
import Sucursal from '#models/sucursal'
import Usuario from '#models/usuario'
import { SunatGateway } from '#integrations/sunat/sunat_service'
import { procesarLote } from '#services/cola_service'
import { programarReconsultas, registrarJobsSunat } from '#jobs/sunat_jobs'
import {
  SunatFalsa,
  asignarRol,
  boletaValida,
  comprobanteApi,
  crearEmpresa,
  crearUsuario,
  exito,
} from '#tests/helpers'

/** Cuerpo de una descarga binaria como texto. */
const contenido = (r: any) => r.text() ?? Buffer.from(r.body()).toString()

const h = (e: Empresa) => ({ 'x-empresa-id': String(e.id) })

async function escenario() {
  const admin = await crearUsuario()
  const empresa = await crearEmpresa(admin)
  return { admin, empresa }
}

test.group('Comprobantes: emisión y estados SUNAT', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.teardown(() => SunatGateway.usar(null))

  test('emite una boleta aceptada y guarda el espejo local con auditoría', async ({
    client,
    assert,
  }) => {
    const falsa = new SunatFalsa().cuando('POST /boletas', exito(comprobanteApi(), 201)).instalar()
    const { admin, empresa } = await escenario()
    const r = await client
      .post('/api/v1/comprobantes')
      .loginAs(admin)
      .headers(h(empresa))
      .json(boletaValida)
    r.assertStatus(201)
    assert.equal(r.body().numero_completo, 'B001-1')
    assert.equal(r.body().sunat_estado, 'aceptado')
    assert.equal(r.body().total, 10)
    assert.notProperty(r.body(), 'payload')

    const enviado = falsa.llamadas[0]
    assert.equal(enviado.cuerpo.serie, 'B001')
    assert.isTrue(enviado.cuerpo.enviar_automatico)
    const comprobante = await Comprobante.findByOrFail('numero_completo', 'B001-1')
    assert.equal(enviado.headers['Idempotency-Key'], comprobante.uuid)
    assert.isNull(await Job.query().where('tipo', 'sunat.reconsultar').first())
  })

  test('factura agrega tipo_operacion y cuotas al crédito', async ({ client, assert }) => {
    const falsa = new SunatFalsa()
      .cuando(
        'POST /facturas',
        exito(
          comprobanteApi({ tipo_documento: '01', serie: 'F001', numero_completo: 'F001-1' }),
          201
        )
      )
      .instalar()
    const { admin, empresa } = await escenario()
    const r = await client
      .post('/api/v1/comprobantes')
      .loginAs(admin)
      .headers(h(empresa))
      .json({
        ...boletaValida,
        tipo_documento: '01',
        forma_pago: 'Credito',
        cuotas: [{ monto: 10, fecha_pago: '2026-12-31' }],
        cliente: {
          tipo_doc: '6',
          num_doc: '20512345678',
          razon_social: 'ACME SAC',
          direccion: 'Av. Lima 1',
        },
      })
    r.assertStatus(201)
    assert.equal(falsa.llamadas[0].cuerpo.tipo_operacion, '0101')
    assert.lengthOf(falsa.llamadas[0].cuerpo.cuotas, 1)
  })

  test('rechaza localmente una boleta > S/ 700 sin documento (sin llamar a la API)', async ({
    client,
    assert,
  }) => {
    const falsa = new SunatFalsa().instalar()
    const { admin, empresa } = await escenario()
    const r = await client
      .post('/api/v1/comprobantes')
      .loginAs(admin)
      .headers(h(empresa))
      .json({
        ...boletaValida,
        items: [
          {
            descripcion: 'TV',
            unidad: 'NIU',
            cantidad: 1,
            precio_unitario: 1500,
            tip_afe_igv: '10',
          },
        ],
      })
    r.assertStatus(422)
    r.assertBodyContains({ errores: [{ campo: 'cliente.tipo_doc' }] })
    assert.lengthOf(falsa.llamadas, 0)
  })

  test('sin serie configurada responde 422 claro', async ({ client }) => {
    new SunatFalsa().instalar()
    const { admin, empresa } = await escenario()
    const r = await client
      .post('/api/v1/comprobantes')
      .loginAs(admin)
      .headers(h(empresa))
      .json({ ...boletaValida, serie: 'B999' })
    r.assertStatus(422)
    r.assertBodyContains({ errores: [{ campo: 'serie' }] })
  })

  test('error 422 de la API se devuelve con detalle y no deja borrador', async ({
    client,
    assert,
  }) => {
    new SunatFalsa()
      .cuando('POST /boletas', {
        status: 422,
        cuerpo: {
          estado: 'error',
          mensaje: 'Error de validación',
          errores: { 'items.0.unidad': ['Unidad inválida'] },
        },
      })
      .instalar()
    const { admin, empresa } = await escenario()
    const r = await client
      .post('/api/v1/comprobantes')
      .loginAs(admin)
      .headers(h(empresa))
      .json(boletaValida)
    r.assertStatus(422)
    r.assertBodyContains({
      origen: 'sunat_api',
      errores: { 'items.0.unidad': ['Unidad inválida'] },
    })
    assert.lengthOf(await Comprobante.query().where('empresa_id', empresa.id), 0)
  })

  test('credenciales SUNAT inválidas se devuelven como 424 (no cierran la sesión)', async ({
    client,
  }) => {
    new SunatFalsa()
      .cuando('POST /boletas', { status: 401, cuerpo: { estado: 'error', mensaje: 'x' } })
      .instalar()
    const { admin, empresa } = await escenario()
    const r = await client
      .post('/api/v1/comprobantes')
      .loginAs(admin)
      .headers(h(empresa))
      .json(boletaValida)
    r.assertStatus(424)
  })

  test('caída de la API: queda en error_envio (202), y el worker lo envía después', async ({
    client,
    assert,
  }) => {
    const falsa = new SunatFalsa()
      .cuando(
        'POST /boletas',
        { error: new TypeError('fetch failed') },
        { error: new TypeError('fetch failed') },
        { error: new TypeError('fetch failed') },
        exito(comprobanteApi({ sunat: { estado: 'enviado' } }), 201)
      )
      .instalar()
    registrarJobsSunat()
    const { admin, empresa } = await escenario()
    const r = await client
      .post('/api/v1/comprobantes')
      .loginAs(admin)
      .headers(h(empresa))
      .json(boletaValida)
    r.assertStatus(202)
    assert.equal(r.body().sunat_estado, 'error_envio')

    const job = await Job.query().where('tipo', 'sunat.enviar').firstOrFail()
    job.disponibleEn = DateTime.now().minus({ seconds: 1 })
    await job.save()
    await procesarLote()

    const comprobante = await Comprobante.findOrFail(r.body().id)
    assert.equal(comprobante.sunatEstado, 'enviado')
    assert.equal(comprobante.sunatApiId, 501)
    await job.refresh()
    assert.equal(job.estado, 'completado')
    // Mismo Idempotency-Key en todos los intentos → la API no duplica
    const claves = new Set(falsa.llamadas.map((l) => l.headers['Idempotency-Key']))
    assert.equal(claves.size, 1)
    // Al quedar "enviado" se programa la reconsulta
    assert.isNotNull(await Job.query().where('tipo', 'sunat.reconsultar').first())
  })

  test('el worker reconsulta hasta que SUNAT acepta', async ({ client, assert }) => {
    new SunatFalsa()
      .cuando('POST /boletas', exito(comprobanteApi({ sunat: { estado: 'pendiente' } }), 201))
      .cuando(
        'GET /boletas/501',
        exito(comprobanteApi({ sunat: { estado: 'enviado' } })),
        exito(comprobanteApi())
      )
      .instalar()
    registrarJobsSunat()
    const { admin, empresa } = await escenario()
    const r = await client
      .post('/api/v1/comprobantes')
      .loginAs(admin)
      .headers(h(empresa))
      .json(boletaValida)
    assert.equal(r.body().sunat_estado, 'pendiente')

    const job = await Job.query().where('tipo', 'sunat.reconsultar').firstOrFail()
    for (let i = 0; i < 2; i++) {
      await Job.query()
        .where('id', job.id)
        .update({ disponible_en: DateTime.now().minus({ seconds: 1 }).toSQL() })
      await procesarLote()
    }
    const comprobante = await Comprobante.findOrFail(r.body().id)
    assert.equal(comprobante.sunatEstado, 'aceptado')
    assert.equal(comprobante.hashCpe, 'abc123')
  })

  test('el programador encola reconsultas de comprobantes olvidados', async ({
    client,
    assert,
  }) => {
    new SunatFalsa()
      .cuando('POST /boletas', exito(comprobanteApi({ sunat: { estado: 'enviado' } }), 201))
      .instalar()
    const { admin, empresa } = await escenario()
    const r = await client
      .post('/api/v1/comprobantes')
      .loginAs(admin)
      .headers(h(empresa))
      .json(boletaValida)
    await Job.query().delete()
    await Comprobante.query()
      .where('id', r.body().id)
      .update({ sunat_consultado_en: DateTime.now().minus({ hours: 1 }).toSQL() })
    assert.equal(await programarReconsultas(), 1)
    assert.equal(await programarReconsultas(), 0)
  })

  test('reconsultar y reenviar desde la bandeja', async ({ client, assert }) => {
    new SunatFalsa()
      .cuando(
        'POST /boletas',
        exito(
          comprobanteApi({ sunat: { estado: 'rechazado', codigo: '2017', descripcion: 'Error' } }),
          201
        )
      )
      .cuando(
        'GET /boletas/501',
        exito(comprobanteApi({ sunat: { estado: 'rechazado', codigo: '2017' } }))
      )
      .cuando('POST /boletas/501/reenviar', exito(comprobanteApi()))
      .instalar()
    const { admin, empresa } = await escenario()
    const r = await client
      .post('/api/v1/comprobantes')
      .loginAs(admin)
      .headers(h(empresa))
      .json(boletaValida)
    assert.equal(r.body().sunat_codigo, '2017')

    const consulta = await client
      .post(`/api/v1/comprobantes/${r.body().id}/reconsultar`)
      .loginAs(admin)
      .headers(h(empresa))
    consulta.assertStatus(200)
    assert.equal(consulta.body().sunat_estado, 'rechazado')

    const reenvio = await client
      .post(`/api/v1/comprobantes/${r.body().id}/reenviar`)
      .loginAs(admin)
      .headers(h(empresa))
    reenvio.assertStatus(200)
    assert.equal(reenvio.body().sunat_estado, 'aceptado')

    const otraVez = await client
      .post(`/api/v1/comprobantes/${r.body().id}/reenviar`)
      .loginAs(admin)
      .headers(h(empresa))
    otraVez.assertStatus(422)
  })

  test('listado con filtros, búsqueda, detalle y resumen por estado', async ({
    client,
    assert,
  }) => {
    new SunatFalsa()
      .cuando(
        'POST /boletas',
        exito(comprobanteApi(), 201),
        exito(
          comprobanteApi({
            id: 502,
            correlativo: 2,
            numero_completo: 'B001-2',
            sunat: { estado: 'rechazado' },
          }),
          201
        )
      )
      .instalar()
    const { admin, empresa } = await escenario()
    await client.post('/api/v1/comprobantes').loginAs(admin).headers(h(empresa)).json(boletaValida)
    await client.post('/api/v1/comprobantes').loginAs(admin).headers(h(empresa)).json(boletaValida)

    const todos = await client.get('/api/v1/comprobantes').loginAs(admin).headers(h(empresa))
    assert.equal(todos.body().meta.total, 2)
    const rechazados = await client
      .get('/api/v1/comprobantes?estado=rechazado&tipo_documento=03')
      .loginAs(admin)
      .headers(h(empresa))
    assert.equal(rechazados.body().data[0].numero_completo, 'B001-2')
    const buscado = await client
      .get('/api/v1/comprobantes?buscar=B001-1&fecha_desde=2000-01-01&fecha_hasta=2999-12-31')
      .loginAs(admin)
      .headers(h(empresa))
    assert.equal(buscado.body().meta.total, 1)

    const resumen = await client
      .get('/api/v1/comprobantes/resumen-estados')
      .loginAs(admin)
      .headers(h(empresa))
    assert.deepEqual(resumen.body(), { aceptado: 1, rechazado: 1 })

    const detalle = await client
      .get(`/api/v1/comprobantes/${todos.body().data[0].id}`)
      .loginAs(admin)
      .headers(h(empresa))
    assert.property(detalle.body(), 'payload')
  })

  test('aislamiento: no se ve el comprobante de otra empresa', async ({ client }) => {
    new SunatFalsa().cuando('POST /boletas', exito(comprobanteApi(), 201)).instalar()
    const { admin, empresa } = await escenario()
    const r = await client
      .post('/api/v1/comprobantes')
      .loginAs(admin)
      .headers(h(empresa))
      .json(boletaValida)
    const otro = await crearUsuario()
    const ajena = await crearEmpresa(otro)
    const intento = await client
      .get(`/api/v1/comprobantes/${r.body().id}`)
      .loginAs(otro)
      .headers(h(ajena))
    intento.assertStatus(404)
  })

  test('un Almacenero no puede emitir comprobantes', async ({ client }) => {
    new SunatFalsa().instalar()
    const { empresa } = await escenario()
    const almacenero = await crearUsuario()
    await asignarRol(almacenero, empresa, 'Almacenero')
    const r = await client
      .post('/api/v1/comprobantes')
      .loginAs(almacenero)
      .headers(h(empresa))
      .json(boletaValida)
    r.assertStatus(403)
  })
})

test.group('Comprobantes: impresión y descargas', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.teardown(() => SunatGateway.usar(null))

  async function emitida(falsa: SunatFalsa) {
    falsa.cuando('POST /boletas', exito(comprobanteApi(), 201)).instalar()
    return escenario()
  }

  test('PDF usa el formato pedido o el predeterminado (usuario > caja > sucursal > empresa)', async ({
    client,
    assert,
  }) => {
    const falsa = new SunatFalsa().cuando('GET /boletas/501/pdf', { binario: '%PDF' })
    const { admin, empresa } = await emitida(falsa)
    const c = await client
      .post('/api/v1/comprobantes')
      .loginAs(admin)
      .headers(h(empresa))
      .json(boletaValida)
    const id = c.body().id

    const explicito = await client
      .get(`/api/v1/comprobantes/${id}/pdf?formato=a5`)
      .loginAs(admin)
      .headers(h(empresa))
    explicito.assertStatus(200)
    assert.equal(contenido(explicito), '%PDF')
    assert.include(explicito.header('content-disposition'), 'B001-1-a5.pdf')

    await client.get(`/api/v1/comprobantes/${id}/pdf`).loginAs(admin).headers(h(empresa))
    await Sucursal.query()
      .where('empresa_id', empresa.id)
      .update({ formato_impresion: 'ticket-80' })
    await client.get(`/api/v1/comprobantes/${id}/pdf`).loginAs(admin).headers(h(empresa))
    await Usuario.query().where('id', admin.id).update({ formato_impresion: 'ticket-58' })
    await client
      .get(`/api/v1/comprobantes/${id}/pdf`)
      .loginAs(admin)
      .headers(h(empresa))
      .header('x-caja-id', '999999')

    const formatos = falsa.llamadas
      .filter((l) => l.ruta.includes('/pdf'))
      .map((l) => l.ruta.split('format=')[1])
    assert.deepEqual(formatos, ['a5', 'a4', 'ticket-80', 'ticket-58'])
  })

  test('descarga XML y CDR por el backend', async ({ client, assert }) => {
    const falsa = new SunatFalsa()
      .cuando('GET /boletas/501/xml', { binario: '<xml/>' })
      .cuando('GET /boletas/501/cdr', { binario: 'ZIP' })
    const { admin, empresa } = await emitida(falsa)
    const c = await client
      .post('/api/v1/comprobantes')
      .loginAs(admin)
      .headers(h(empresa))
      .json(boletaValida)
    const xml = await client
      .get(`/api/v1/comprobantes/${c.body().id}/xml`)
      .loginAs(admin)
      .headers(h(empresa))
    assert.equal(contenido(xml), '<xml/>')
    assert.include(xml.header('content-disposition'), 'attachment')
    const cdr = await client
      .get(`/api/v1/comprobantes/${c.body().id}/cdr`)
      .loginAs(admin)
      .headers(h(empresa))
    assert.include(cdr.header('content-disposition'), '.zip')
  })

  test('no descarga si el comprobante aún no llegó a SUNAT', async ({ client }) => {
    new SunatFalsa().cuando('POST /boletas', { error: new TypeError('fetch failed') }).instalar()
    const { admin, empresa } = await escenario()
    const c = await client
      .post('/api/v1/comprobantes')
      .loginAs(admin)
      .headers(h(empresa))
      .json(boletaValida)
    const r = await client
      .get(`/api/v1/comprobantes/${c.body().id}/pdf`)
      .loginAs(admin)
      .headers(h(empresa))
    r.assertStatus(409)
  })

  test('consulta de RUC/DNI pasa por la API con las credenciales de la empresa', async ({
    client,
    assert,
  }) => {
    const falsa = new SunatFalsa()
      .cuando('GET /buscar-documento', exito({ razon_social: 'ACME SAC' }))
      .instalar()
    const { admin, empresa } = await escenario()
    const r = await client
      .get('/api/v1/consultas/documento?tipo=6&numero=20512345678')
      .loginAs(admin)
      .headers(h(empresa))
    r.assertStatus(200)
    assert.equal(r.body().razon_social, 'ACME SAC')
    assert.equal(falsa.llamadas[0].headers['X-Api-Key'], empresa.credenciales().apiKey)
  })
})

test.group('Alta de empresa nueva (POST /registro)', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.teardown(() => SunatGateway.usar(null))

  test('envía multipart con certificado y guarda el secret cifrado', async ({ client, assert }) => {
    const falsa = new SunatFalsa()
      .cuando(
        'POST /registro',
        exito(
          {
            tenant_id: 9,
            ruc: '20605555555',
            razon_social: 'NUEVA SAC',
            entorno: 'beta',
            api_key: 'k-nueva-123',
            api_secret: 's-nueva-123',
          },
          201
        )
      )
      .cuando('GET /sucursales', exito([]))
      .cuando('POST /sucursales', exito({ id: 30 }, 201))
      .cuando('POST /series', exito({ creadas: [{ id: 1, serie: 'X' }] }, 201))
      .instalar()
    const u = await crearUsuario()
    const r = await client
      .post('/api/v1/empresas/registrar')
      .loginAs(u)
      .fields({
        ruc: '20605555555',
        razon_social: 'NUEVA SAC',
        direccion: 'Av. Nueva 1',
        ubigeo: '150101',
        sol_user: 'MODDATOS',
        sol_pass: 'moddatos',
        entorno: 'beta',
        regimen: 'general',
        contrasena_certificado: '123456',
        gre_client_id: 'cid',
        gre_client_secret: 'csecret',
      })
      .file('certificado', Buffer.from('certificado-falso'), { filename: 'cert.pfx' })
    r.assertStatus(201)
    const form = falsa.llamadas[0].cuerpo as FormData
    assert.equal(form.get('sol_user'), 'MODDATOS')
    assert.instanceOf(form.get('certificado'), Blob)
    const empresa = await Empresa.findByOrFail('ruc', '20605555555')
    assert.isTrue(empresa.greConfigurada)
    assert.equal(empresa.sunatTenantId, 9)
    assert.equal(empresa.credenciales().apiSecret, 's-nueva-123')
    const sucursal = await Sucursal.query().where('empresa_id', empresa.id).firstOrFail()
    assert.equal(sucursal.sunatSucursalId, 30)
  })

  test('rechaza certificados de más de 100 KB', async ({ client }) => {
    new SunatFalsa().instalar()
    const u = await crearUsuario()
    const r = await client
      .post('/api/v1/empresas/registrar')
      .loginAs(u)
      .fields({
        ruc: '20605555556',
        razon_social: 'X SAC',
        direccion: 'D',
        ubigeo: '150101',
        sol_user: 'U',
        sol_pass: 'P',
        entorno: 'beta',
        regimen: 'general',
      })
      .file('certificado', Buffer.alloc(150 * 1024), { filename: 'cert.pfx' })
    r.assertStatus(422)
    r.assertBodyContains({ errores: [{ campo: 'certificado' }] })
  })
})
