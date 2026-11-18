import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Auditoria from '#models/auditoria'
import type Empresa from '#models/empresa'
import Serie from '#models/serie'
import Sucursal from '#models/sucursal'
import { SunatGateway } from '#integrations/sunat/sunat_service'
import { limpiarCacheUbigeo } from '#controllers/catalogo_controller'
import {
  ConfiguracionSunatService,
  sinSecretos,
  tasaComoFraccion,
} from '#services/configuracion_sunat_service'
import { SunatFalsa, asignarRol, crearEmpresa, crearUsuario, exito } from '#tests/helpers'

/** PNG real de 1×1: el validador detecta el tipo por el contenido. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

const h = (e: Empresa) => ({ 'x-empresa-id': String(e.id) })

/** Respuesta típica de GET/PUT /empresa (TenantResource de la API). */
function empresaApi(parcial: Record<string, unknown> = {}) {
  return {
    id: 9,
    ruc: '20601234567',
    razon_social: 'EMPRESA REMOTA SAC',
    nombre_comercial: 'Remota',
    direccion: 'Av. Remota 456',
    ubigeo: '150122',
    departamento: 'LIMA',
    provincia: 'LIMA',
    distrito: 'MIRAFLORES',
    sol_user: 'MODDATOS',
    tiene_sol_pass: true,
    client_id: 'gre-id',
    tiene_client_secret: true,
    entorno: 'beta',
    plan: 'pro',
    tax_regime: 'mype',
    igv_rate_override: null,
    nrus_categoria: null,
    tasa_igv_vigente: 0.18,
    max_documentos_mes: 500,
    documentos_este_mes: 12,
    activo: true,
    logo_url: '/storage/logos/x.png',
    tiene_certificado: true,
    telefonos: ['999888777'],
    emails: ['ventas@remota.pe'],
    cuentas_bancarias: [],
    billeteras_digitales: [],
    mensaje_agradecimiento: 'Gracias',
    mensaje_promocional: null,
    ...parcial,
  }
}

const estadoSunat = {
  status: 200,
  cuerpo: {
    estado: 'exito',
    sunat: { disponible: true, circuit: 'closed', fallas: 0, entorno: 'beta' },
  },
}

async function preparar() {
  const admin = await crearUsuario()
  const empresa = await crearEmpresa(admin)
  return { admin, empresa }
}

test.group('Configuración SUNAT: datos de la empresa', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.teardown(() => SunatGateway.usar(null))

  test('muestra la configuración remota sin secretos y refleja el espejo local', async ({
    client,
    assert,
  }) => {
    new SunatFalsa()
      .cuando('GET /empresa', exito(empresaApi()))
      .cuando('GET /sunat/estado', estadoSunat)
      .instalar()
    const { admin, empresa } = await preparar()
    const r = await client.get('/api/v1/empresa/sunat').loginAs(admin).headers(h(empresa))
    r.assertStatus(200)
    assert.equal(r.body().remota.razon_social, 'EMPRESA REMOTA SAC')
    assert.isTrue(r.body().remota.tiene_sol_pass)
    assert.notProperty(r.body().remota, 'sol_pass')
    assert.notProperty(r.body().remota, 'id')
    assert.isTrue(r.body().servicio.disponible)
    assert.equal(r.body().remota.documentos_este_mes, 12)

    await empresa.refresh()
    assert.equal(empresa.razonSocial, 'EMPRESA REMOTA SAC')
    assert.equal(empresa.regimen, 'mype')
    assert.equal(empresa.distrito, 'MIRAFLORES')
    assert.isTrue(empresa.greConfigurada)
    assert.equal(empresa.logoUrl, '/storage/logos/x.png')
  })

  test('si /sunat/estado falla, la configuración igual se muestra', async ({ client, assert }) => {
    new SunatFalsa()
      .cuando('GET /empresa', exito(empresaApi({ tax_regime: 'otro', entorno: 'production' })))
      .cuando('GET /sunat/estado', { status: 500, cuerpo: { estado: 'error' } })
      .instalar()
    const { admin, empresa } = await preparar()
    const r = await client.get('/api/v1/empresa/sunat').loginAs(admin).headers(h(empresa))
    r.assertStatus(200)
    assert.isNull(r.body().servicio)
    await empresa.refresh()
    assert.equal(empresa.regimen, 'general', 'un régimen desconocido no pisa el local')
    assert.equal(empresa.entorno, 'production')
  })

  test('la vista completa valores por defecto cuando la API no los trae', ({ assert }) => {
    const v = new ConfiguracionSunatService().vista({ ruc: '20601234567', razon_social: 'X' })
    assert.equal(v.tax_regime, 'general')
    assert.equal(v.entorno, 'beta')
    assert.deepEqual(v.telefonos, [])
    assert.isFalse(v.tiene_certificado)
    assert.isTrue(v.activo)
  })

  test('actualiza en la API, refleja y audita sin secretos', async ({ client, assert }) => {
    const falsa = new SunatFalsa()
      .cuando(
        'PUT /empresa',
        exito(empresaApi({ razon_social: 'NUEVA RAZON SAC', tasa_igv_vigente: 0.105 }))
      )
      .instalar()
    const { admin, empresa } = await preparar()
    const r = await client
      .put('/api/v1/empresa/sunat')
      .loginAs(admin)
      .headers(h(empresa))
      .json({
        razon_social: 'NUEVA RAZON SAC',
        sol_user: 'NUEVOSOL',
        sol_pass: 'clave-sol',
        client_secret: 'secreto-gre',
        telefonos: ['999111222'],
        cuentas_bancarias: [
          { banco: 'BCP', tipo_cuenta: 'Corriente', moneda: 'PEN', numero: '193-123' },
        ],
        billeteras_digitales: [{ tipo: 'yape', numero: '999111222' }],
      })
    r.assertStatus(200)
    assert.equal(r.body().razon_social, 'NUEVA RAZON SAC')
    const enviado = falsa.llamadas.find((l) => l.metodo === 'PUT')!.cuerpo
    assert.equal(enviado.sol_pass, 'clave-sol', 'el secreto sí viaja a la API')
    assert.equal(enviado.cuentas_bancarias[0].banco, 'BCP')

    await empresa.refresh()
    assert.equal(empresa.razonSocial, 'NUEVA RAZON SAC')
    assert.equal(empresa.igvTasa, 0.105)

    const evento = await Auditoria.query()
      .where({ empresaId: empresa.id, accion: 'empresa.configuracion_sunat' })
      .firstOrFail()
    const texto = JSON.stringify(evento.despues)
    assert.notInclude(texto, 'clave-sol')
    assert.notInclude(texto, 'secreto-gre')
    assert.include(texto, 'NUEVOSOL')
  })

  test('pasar a producción exige confirmación', async ({ client, assert }) => {
    const falsa = new SunatFalsa()
      .cuando('PUT /empresa', exito(empresaApi({ entorno: 'production' })))
      .instalar()
    const { admin, empresa } = await preparar()
    const sin = await client
      .put('/api/v1/empresa/sunat')
      .loginAs(admin)
      .headers(h(empresa))
      .json({ entorno: 'production' })
    sin.assertStatus(422)
    sin.assertBodyContains({ errores: [{ campo: 'confirmar_produccion' }] })
    assert.lengthOf(falsa.llamadas, 0)

    const con = await client
      .put('/api/v1/empresa/sunat')
      .loginAs(admin)
      .headers(h(empresa))
      .json({ entorno: 'production', confirmar_produccion: true })
    con.assertStatus(200)
    assert.notProperty(falsa.llamadas[0].cuerpo, 'confirmar_produccion')
    await empresa.refresh()
    assert.equal(empresa.entorno, 'production')

    // Ya en producción, reenviar "production" no vuelve a pedir confirmación
    const otra = await client
      .put('/api/v1/empresa/sunat')
      .loginAs(admin)
      .headers(h(empresa))
      .json({ entorno: 'production' })
    otra.assertStatus(200)
  })

  test('la categoría NRUS solo vale para el Nuevo RUS', async ({ client }) => {
    new SunatFalsa().instalar()
    const { admin, empresa } = await preparar()
    const r = await client
      .put('/api/v1/empresa/sunat')
      .loginAs(admin)
      .headers(h(empresa))
      .json({ tax_regime: 'general', nrus_categoria: 1 })
    r.assertStatus(422)
    r.assertBodyContains({ errores: [{ campo: 'nrus_categoria' }] })
  })

  test('los errores de validación de la API llegan al usuario', async ({ client }) => {
    new SunatFalsa()
      .cuando('PUT /empresa', {
        status: 422,
        cuerpo: { estado: 'error', mensaje: 'El ubigeo no existe.' },
      })
      .instalar()
    const { admin, empresa } = await preparar()
    const r = await client
      .put('/api/v1/empresa/sunat')
      .loginAs(admin)
      .headers(h(empresa))
      .json({ ubigeo: '999999' })
    r.assertStatus(422)
    r.assertBodyContains({ mensaje: 'El ubigeo no existe.' })
  })

  test('valida formatos antes de llamar a la API', async ({ client }) => {
    new SunatFalsa().instalar()
    const { admin, empresa } = await preparar()
    const r = await client
      .put('/api/v1/empresa/sunat')
      .loginAs(admin)
      .headers(h(empresa))
      .json({ emails: ['no-es-correo'], billeteras_digitales: [{ tipo: 'paypal', numero: '1' }] })
    r.assertStatus(422)
  })

  test('sincronizar vuelve a leer la API', async ({ client, assert }) => {
    new SunatFalsa()
      .cuando('GET /empresa', exito(empresaApi({ direccion: 'Jr. Sincronizado 1' })))
      .instalar()
    const { admin, empresa } = await preparar()
    const r = await client
      .post('/api/v1/empresa/sunat/sincronizar')
      .loginAs(admin)
      .headers(h(empresa))
    r.assertStatus(200)
    await empresa.refresh()
    assert.equal(empresa.direccion, 'Jr. Sincronizado 1')
  })

  test('sin permiso config.empresa no se puede ver ni cambiar', async ({ client }) => {
    new SunatFalsa().instalar()
    const { empresa } = await preparar()
    const vendedor = await crearUsuario()
    await asignarRol(vendedor, empresa, 'Vendedor')
    const ver = await client.get('/api/v1/empresa/sunat').loginAs(vendedor).headers(h(empresa))
    ver.assertStatus(403)
    const cambiar = await client
      .put('/api/v1/empresa/sunat')
      .loginAs(vendedor)
      .headers(h(empresa))
      .json({ razon_social: 'HACK SAC' })
    cambiar.assertStatus(403)
  })

  test('la tasa de IGV en porcentaje (como la manda la API real) se guarda como fracción', async ({
    client,
    assert,
  }) => {
    new SunatFalsa()
      .cuando('GET /empresa', exito(empresaApi({ tasa_igv_vigente: 18 })))
      .cuando('GET /sunat/estado', estadoSunat)
      .instalar()
    const { admin, empresa } = await preparar()
    const r = await client.get('/api/v1/empresa/sunat').loginAs(admin).headers(h(empresa))
    r.assertStatus(200)
    assert.equal(r.body().remota.tasa_igv_vigente, 0.18)
    await empresa.refresh()
    assert.equal(Number(empresa.igvTasa), 0.18)
  })

  test('tasaComoFraccion normaliza porcentajes y descarta basura', ({ assert }) => {
    assert.equal(tasaComoFraccion(18), 0.18)
    assert.equal(tasaComoFraccion(10.5), 0.105)
    assert.equal(tasaComoFraccion('18.00'), 0.18)
    assert.equal(tasaComoFraccion(0.18), 0.18)
    assert.equal(tasaComoFraccion(0), 0)
    assert.isNull(tasaComoFraccion(null))
    assert.isNull(tasaComoFraccion('abc'))
    assert.isNull(tasaComoFraccion(-1))
  })

  test('sinSecretos enmascara solo las claves', ({ assert }) => {
    assert.deepEqual(sinSecretos({ sol_user: 'U', sol_pass: 'P' }), {
      sol_user: 'U',
      sol_pass: '***',
    })
    assert.deepEqual(sinSecretos({ razon_social: 'X' }), { razon_social: 'X' })
  })
})

test.group('Configuración SUNAT: certificado, logo y credenciales', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.teardown(() => SunatGateway.usar(null))

  test('sube el certificado .pfx con su contraseña en multipart', async ({ client, assert }) => {
    const falsa = new SunatFalsa().cuando('POST /empresa/certificado', exito(null)).instalar()
    const { admin, empresa } = await preparar()
    const r = await client
      .post('/api/v1/empresa/sunat/certificado')
      .loginAs(admin)
      .headers(h(empresa))
      .field('contrasena_certificado', 'clave-cert')
      .file('certificado', Buffer.from('PFX'), { filename: 'firma.pfx' })
    r.assertStatus(200)
    const cuerpo = falsa.llamadas[0].cuerpo as FormData
    assert.instanceOf(cuerpo, FormData)
    assert.equal(cuerpo.get('contrasena_certificado'), 'clave-cert')
    assert.exists(cuerpo.get('certificado'))
    const evento = await Auditoria.query()
      .where({ empresaId: empresa.id, accion: 'empresa.certificado' })
      .firstOrFail()
    assert.notInclude(JSON.stringify(evento.despues), 'clave-cert')
  })

  test('un .pem no necesita contraseña; un .pfx sí', async ({ client, assert }) => {
    const falsa = new SunatFalsa().cuando('POST /empresa/certificado', exito(null)).instalar()
    const { admin, empresa } = await preparar()
    const pem = await client
      .post('/api/v1/empresa/sunat/certificado')
      .loginAs(admin)
      .headers(h(empresa))
      .file('certificado', Buffer.from('PEM'), { filename: 'firma.pem' })
    pem.assertStatus(200)
    assert.isNull((falsa.llamadas[0].cuerpo as FormData).get('contrasena_certificado'))

    const pfx = await client
      .post('/api/v1/empresa/sunat/certificado')
      .loginAs(admin)
      .headers(h(empresa))
      .file('certificado', Buffer.from('PFX'), { filename: 'firma.p12' })
    pfx.assertStatus(422)
    pfx.assertBodyContains({ errores: [{ campo: 'contrasena_certificado' }] })
  })

  test('rechaza archivos que no son certificados', async ({ client }) => {
    new SunatFalsa().instalar()
    const { admin, empresa } = await preparar()
    const r = await client
      .post('/api/v1/empresa/sunat/certificado')
      .loginAs(admin)
      .headers(h(empresa))
      .file('certificado', Buffer.from('X'), { filename: 'virus.exe' })
    r.assertStatus(422)
  })

  test('sube el logo y guarda su URL', async ({ client, assert }) => {
    new SunatFalsa()
      .cuando(
        'POST /empresa/logo',
        exito({ logo_path: 'logos/x.png', logo_url: '/storage/logos/x.png' })
      )
      .instalar()
    const { admin, empresa } = await preparar()
    const r = await client
      .post('/api/v1/empresa/sunat/logo')
      .loginAs(admin)
      .headers(h(empresa))
      .file('logo', PNG_1X1, { filename: 'logo.png' })
    assert.equal(r.status(), 200, JSON.stringify(r.body()))
    assert.equal(r.body().logo_url, '/storage/logos/x.png')
    await empresa.refresh()
    assert.equal(empresa.logoUrl, '/storage/logos/x.png')
  })

  test('logo sin URL en la respuesta deja el campo vacío', async ({ client, assert }) => {
    new SunatFalsa().cuando('POST /empresa/logo', exito({ logo_path: 'x' })).instalar()
    const { admin, empresa } = await preparar()
    const r = await client
      .post('/api/v1/empresa/sunat/logo')
      .loginAs(admin)
      .headers(h(empresa))
      .file('logo', PNG_1X1, { filename: 'logo.png' })
    r.assertStatus(200)
    await empresa.refresh()
    assert.isNull(empresa.logoUrl)
  })

  test('regenerar credenciales guarda las nuevas cifradas y no las expone', async ({
    client,
    assert,
  }) => {
    const falsa = new SunatFalsa()
      .cuando(
        'POST /empresa/credenciales/regenerar',
        exito({ api_key: 'nueva-clave-api-123', api_secret: 'nuevo-secreto-456' })
      )
      .instalar()
    const { admin, empresa } = await preparar()
    const r = await client
      .post('/api/v1/empresa/sunat/credenciales/regenerar')
      .loginAs(admin)
      .headers(h(empresa))
    r.assertStatus(200)
    assert.equal(r.body().sunat_api_key, 'nuev••••-123')
    assert.notInclude(JSON.stringify(r.body()), 'nuevo-secreto-456')
    await empresa.refresh()
    assert.deepEqual(empresa.credenciales(), {
      apiKey: 'nueva-clave-api-123',
      apiSecret: 'nuevo-secreto-456',
    })
    assert.lengthOf(falsa.llamadas, 1)
  })

  test('si no se pueden guardar las nuevas credenciales, se registra y se propaga', async ({
    assert,
  }) => {
    new SunatFalsa()
      .cuando(
        'POST /empresa/credenciales/regenerar',
        exito({ api_key: 'clave-perdida-123', api_secret: 'secreto-perdido' })
      )
      .instalar()
    const { empresa } = await preparar()
    empresa.save = async () => {
      throw new Error('base de datos caída')
    }
    await assert.rejects(
      () => new ConfiguracionSunatService().regenerarCredenciales(empresa),
      'base de datos caída'
    )
  })

  test('si la API rechaza la regeneración, las credenciales no cambian', async ({
    client,
    assert,
  }) => {
    new SunatFalsa()
      .cuando('POST /empresa/credenciales/regenerar', {
        status: 429,
        cuerpo: { estado: 'error', mensaje: 'Demasiadas solicitudes.' },
      })
      .instalar()
    const { admin, empresa } = await preparar()
    const antes = empresa.credenciales()
    const r = await client
      .post('/api/v1/empresa/sunat/credenciales/regenerar')
      .loginAs(admin)
      .headers(h(empresa))
    r.assertStatus(429)
    await empresa.refresh()
    assert.deepEqual(empresa.credenciales(), antes)
  })
})

test.group('Configuración SUNAT: ubigeo, sucursales y series', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.setup(() => limpiarCacheUbigeo())
  group.each.teardown(() => SunatGateway.usar(null))

  test('ubigeo encadenado desde la API y en caché', async ({ client, assert }) => {
    const falsa = new SunatFalsa()
      .cuando('GET /catalogos/ubigeo/regiones', exito([{ id: '15', nombre: 'LIMA' }]))
      .cuando(
        'GET /catalogos/ubigeo/provincias',
        exito([{ id: '1501', nombre: 'LIMA', region_id: '15' }])
      )
      .cuando('GET /catalogos/ubigeo/distritos', exito([{ id: 150122, nombre: 'MIRAFLORES' }]))
      .instalar()
    const { admin, empresa } = await preparar()
    const regiones = await client
      .get('/api/v1/catalogos/ubigeo/regiones')
      .loginAs(admin)
      .headers(h(empresa))
    assert.deepEqual(regiones.body(), [{ id: '15', nombre: 'LIMA' }])
    const provincias = await client
      .get('/api/v1/catalogos/ubigeo/provincias?region_id=15')
      .loginAs(admin)
      .headers(h(empresa))
    assert.deepEqual(provincias.body(), [{ id: '1501', nombre: 'LIMA' }])
    const distritos = await client
      .get('/api/v1/catalogos/ubigeo/distritos?provincia_id=1501')
      .loginAs(admin)
      .headers(h(empresa))
    assert.deepEqual(distritos.body(), [{ id: '150122', nombre: 'MIRAFLORES' }])
    assert.include(
      falsa.llamadas.map((l) => l.ruta),
      '/catalogos/ubigeo/provincias?region_id=15'
    )

    await client.get('/api/v1/catalogos/ubigeo/regiones').loginAs(admin).headers(h(empresa))
    assert.lengthOf(
      falsa.llamadas.filter((l) => l.ruta.startsWith('/catalogos/ubigeo/regiones')),
      1,
      'la segunda vez sale de caché'
    )
  })

  test('ubigeo: nivel desconocido y padre faltante o inválido', async ({ client }) => {
    new SunatFalsa().instalar()
    const { admin, empresa } = await preparar()
    const nivel = await client
      .get('/api/v1/catalogos/ubigeo/paises')
      .loginAs(admin)
      .headers(h(empresa))
    nivel.assertStatus(404)
    const sinRegion = await client
      .get('/api/v1/catalogos/ubigeo/provincias')
      .loginAs(admin)
      .headers(h(empresa))
    sinRegion.assertStatus(422)
    sinRegion.assertBodyContains({ mensaje: 'Indique region_id.' })
    const sinProvincia = await client
      .get('/api/v1/catalogos/ubigeo/distritos')
      .loginAs(admin)
      .headers(h(empresa))
    sinProvincia.assertBodyContains({ mensaje: 'Indique provincia_id.' })
    const malo = await client
      .get('/api/v1/catalogos/ubigeo/provincias?region_id=ABC')
      .loginAs(admin)
      .headers(h(empresa))
    malo.assertStatus(422)
  })

  test('editar una sucursal la actualiza primero en la API', async ({ client, assert }) => {
    const falsa = new SunatFalsa().cuando('PUT /sucursales/1', exito({ id: 1 })).instalar()
    const { admin, empresa } = await preparar()
    const sucursal = await Sucursal.findByOrFail('empresa_id', empresa.id)
    const r = await client
      .put(`/api/v1/sucursales/${sucursal.id}`)
      .loginAs(admin)
      .headers(h(empresa))
      .json({
        nombre: 'Sede Centro',
        cod_local: '0000',
        direccion: 'Jr. Nuevo 1',
        ubigeo: '150122',
      })
    r.assertStatus(200)
    const enviado = falsa.llamadas.find((l) => l.metodo === 'PUT')!
    assert.deepEqual(enviado.cuerpo, {
      nombre: 'Sede Centro',
      direccion: 'Jr. Nuevo 1',
      ubigeo: '150122',
      activo: true,
    })
    await sucursal.refresh()
    assert.equal(sucursal.nombre, 'Sede Centro')
  })

  test('si la API rechaza el cambio de sucursal, el espejo local no cambia', async ({
    client,
    assert,
  }) => {
    new SunatFalsa()
      .cuando('PUT /sucursales/1', {
        status: 422,
        cuerpo: { estado: 'error', mensaje: 'Ubigeo inválido.' },
      })
      .instalar()
    const { admin, empresa } = await preparar()
    const sucursal = await Sucursal.findByOrFail('empresa_id', empresa.id)
    const r = await client
      .put(`/api/v1/sucursales/${sucursal.id}`)
      .loginAs(admin)
      .headers(h(empresa))
      .json({ nombre: 'Otra', cod_local: '0000', direccion: 'X 1', ubigeo: '150101' })
    r.assertStatus(422)
    await sucursal.refresh()
    assert.equal(sucursal.nombre, 'Principal')
  })

  test('sucursal sin id remoto solo se actualiza localmente', async ({ client, assert }) => {
    const falsa = new SunatFalsa().instalar()
    const { admin, empresa } = await preparar()
    const sucursal = await Sucursal.findByOrFail('empresa_id', empresa.id)
    sucursal.sunatSucursalId = null
    await sucursal.save()
    const r = await client
      .put(`/api/v1/sucursales/${sucursal.id}`)
      .loginAs(admin)
      .headers(h(empresa))
      .json({
        nombre: 'Local',
        cod_local: '0000',
        direccion: 'X 1',
        ubigeo: '150101',
        activo: false,
      })
    r.assertStatus(200)
    assert.lengthOf(falsa.llamadas, 0)
  })

  test('activar/desactivar series en la API y aquí', async ({ client, assert }) => {
    const falsa = new SunatFalsa().cuando('PUT /series/77', exito({ id: 77 })).instalar()
    const { admin, empresa } = await preparar()
    const serie = await Serie.query().where({ empresaId: empresa.id, serie: 'B001' }).firstOrFail()
    serie.sunatSerieId = 77
    await serie.save()
    const r = await client
      .put(`/api/v1/series/${serie.id}`)
      .loginAs(admin)
      .headers(h(empresa))
      .json({ activo: false })
    r.assertStatus(200)
    assert.deepEqual(falsa.llamadas[0].cuerpo, { activo: false })
    await serie.refresh()
    assert.isFalse(serie.activo)
    assert.exists(
      await Auditoria.query().where({ empresaId: empresa.id, accion: 'serie.actualizar' }).first()
    )

    const otra = await Serie.query().where({ empresaId: empresa.id, serie: 'F001' }).firstOrFail()
    const local = await client
      .put(`/api/v1/series/${otra.id}`)
      .loginAs(admin)
      .headers(h(empresa))
      .json({ activo: false })
    local.assertStatus(200)
    assert.lengthOf(falsa.llamadas, 1, 'sin id remoto no llama a la API')
  })

  test('no se puede tocar la serie de otra empresa', async ({ client }) => {
    new SunatFalsa().instalar()
    const { admin, empresa } = await preparar()
    const otra = await crearEmpresa(await crearUsuario())
    const ajena = await Serie.query().where('empresa_id', otra.id).firstOrFail()
    const r = await client
      .put(`/api/v1/series/${ajena.id}`)
      .loginAs(admin)
      .headers(h(empresa))
      .json({ activo: false })
    r.assertStatus(404)
  })
})
