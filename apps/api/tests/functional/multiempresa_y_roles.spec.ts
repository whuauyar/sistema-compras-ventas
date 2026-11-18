import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Empresa from '#models/empresa'
import Rol from '#models/rol'
import Serie from '#models/serie'
import Sucursal from '#models/sucursal'
import UsuarioEmpresaRol from '#models/usuario_empresa_rol'
import Auditoria from '#models/auditoria'
import { SunatGateway } from '#integrations/sunat/sunat_service'
import Usuario from '#models/usuario'
import {
  SunatFalsa,
  asignarRol,
  crearEmpresa,
  crearSuperadmin,
  crearUsuario,
  datosAdministrador,
  exito,
} from '#tests/helpers'

test.group('Multiempresa: alta, vínculo y aislamiento', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.teardown(() => SunatGateway.usar(null))

  test('vincula una empresa existente: credenciales cifradas, roles, sucursal y series', async ({
    client,
    assert,
  }) => {
    const falsa = new SunatFalsa()
      .cuando(
        'GET /empresa',
        exito({
          id: 77,
          ruc: '20601234567',
          razon_social: 'NEGOCIO SAC',
          direccion: 'Jr. Lima 1',
          ubigeo: '150101',
          entorno: 'beta',
          tax_regime: 'mype',
        })
      )
      .cuando(
        'GET /sucursales',
        exito([{ id: 5, nombre: 'Principal', cod_local: '0000', es_principal: true }])
      )
      .cuando('POST /series', exito({ creadas: [{ id: 1, serie: 'X' }] }, 201))
      .instalar()
    const sa = await crearSuperadmin()
    const r = await client
      .post('/api/v1/admin/empresas/vincular')
      .loginAs(sa)
      .json({
        api_key: 'clave-api-123',
        api_secret: 'secreto-api-123',
        ...datosAdministrador('nuevo-admin@negocio.pe'),
      })
    r.assertStatus(201)
    assert.deepEqual(r.body().advertencias, [])
    assert.notProperty(r.body().empresa, 'sunat_api_secret_cifrada')
    assert.equal(r.body().empresa.sunat_api_key, 'clav••••-123')

    const empresa = await Empresa.findByOrFail('ruc', '20601234567')
    assert.equal(empresa.regimen, 'mype')
    assert.notInclude(empresa.sunatApiSecretCifrada, 'secreto-api-123')
    assert.deepEqual(empresa.credenciales(), {
      apiKey: 'clave-api-123',
      apiSecret: 'secreto-api-123',
    })
    assert.lengthOf(await Rol.query().where('empresa_id', empresa.id), 7)
    const sucursal = await Sucursal.query().where('empresa_id', empresa.id).firstOrFail()
    assert.equal(sucursal.sunatSucursalId, 5)
    assert.lengthOf(await Serie.query().where('empresa_id', empresa.id), 7)
    assert.equal(falsa.llamadas.filter((l) => l.ruta === '/series').length, 7)
    const u = await Usuario.findByOrFail('email', 'nuevo-admin@negocio.pe')
    assert.equal(u.empresaPredeterminadaId, empresa.id)
    const membresia = await UsuarioEmpresaRol.query()
      .where({ usuarioId: u.id, empresaId: empresa.id })
      .preload('rol')
      .firstOrFail()
    assert.equal(membresia.rol.nombre, 'Administrador')
    assert.isFalse(
      Boolean(await UsuarioEmpresaRol.query().where({ usuarioId: sa.id }).first()),
      'el SuperAdmin no queda como miembro'
    )
  })

  test('vincular con credenciales inválidas responde 422 claro', async ({ client }) => {
    new SunatFalsa()
      .cuando('GET /empresa', {
        status: 401,
        cuerpo: { estado: 'error', mensaje: 'Credenciales inválidas' },
      })
      .instalar()
    const sa = await crearSuperadmin()
    const r = await client
      .post('/api/v1/admin/empresas/vincular')
      .loginAs(sa)
      .json({ api_key: 'clave-mala-1', api_secret: 'secreto-malo-1', ...datosAdministrador() })
    r.assertStatus(422)
    r.assertBodyContains({ errores: [{ campo: 'api_key' }] })
  })

  test('no duplica una empresa con el mismo RUC', async ({ client }) => {
    const u = await crearUsuario()
    const existente = await crearEmpresa(u)
    new SunatFalsa()
      .cuando('GET /empresa', exito({ ruc: existente.ruc, razon_social: 'X' }))
      .instalar()
    const r = await client
      .post('/api/v1/admin/empresas/vincular')
      .loginAs(await crearSuperadmin())
      .json({ api_key: 'clave-api-123', api_secret: 'secreto-api-123', ...datosAdministrador() })
    r.assertStatus(422)
  })

  test('si la API cae al preparar la estructura, la empresa queda guardada con advertencias', async ({
    client,
    assert,
  }) => {
    new SunatFalsa()
      .cuando('GET /empresa', exito({ ruc: '20609999999', razon_social: 'CAIDA SAC' }))
      .cuando('GET /sucursales', { status: 500, cuerpo: { estado: 'error' } })
      .cuando('POST /sucursales', { status: 500, cuerpo: { estado: 'error' } })
      .cuando('POST /series', {
        status: 422,
        cuerpo: { estado: 'error', mensaje: 'Serie existente' },
      })
      .instalar()
    const r = await client
      .post('/api/v1/admin/empresas/vincular')
      .loginAs(await crearSuperadmin())
      .json({ api_key: 'clave-api-123', api_secret: 'secreto-api-123', ...datosAdministrador() })
    r.assertStatus(201)
    assert.isAbove(r.body().advertencias.length, 1)
    const empresa = await Empresa.findByOrFail('ruc', '20609999999')
    assert.lengthOf(await Serie.query().where('empresa_id', empresa.id), 7)
  })

  test('exige la cabecera X-Empresa-Id', async ({ client }) => {
    const u = await crearUsuario()
    const r = await client.get('/api/v1/empresa').loginAs(u)
    r.assertStatus(400)
  })

  test('un usuario NO puede operar una empresa ajena', async ({ client }) => {
    const a = await crearUsuario()
    const b = await crearUsuario()
    await crearEmpresa(a)
    const deB = await crearEmpresa(b)
    const r = await client.get('/api/v1/series').loginAs(a).header('x-empresa-id', String(deB.id))
    r.assertStatus(403)
  })

  test('la membresía desactivada bloquea el acceso', async ({ client }) => {
    const u = await crearUsuario()
    const empresa = await crearEmpresa(u)
    await UsuarioEmpresaRol.query()
      .where({ usuarioId: u.id, empresaId: empresa.id })
      .update({ activo: false })
    const r = await client
      .get('/api/v1/empresa')
      .loginAs(u)
      .header('x-empresa-id', String(empresa.id))
    r.assertStatus(403)
  })

  test('muestra y actualiza la empresa con auditoría', async ({ client, assert }) => {
    const u = await crearUsuario()
    const empresa = await crearEmpresa(u)
    const ver = await client
      .get('/api/v1/empresa')
      .loginAs(u)
      .header('x-empresa-id', String(empresa.id))
    ver.assertStatus(200)
    assert.match(ver.body().sunat_api_key, /••••/)
    const r = await client
      .put('/api/v1/empresa')
      .loginAs(u)
      .header('x-empresa-id', String(empresa.id))
      .json({ formato_impresion: 'ticket-80', permitir_venta_sin_stock: true })
    r.assertStatus(200)
    assert.equal(r.body().formato_impresion, 'ticket-80')
    const log = await Auditoria.query()
      .where({ empresaId: empresa.id, accion: 'empresa.actualizar' })
      .firstOrFail()
    assert.equal((log.antes as any).formato_impresion, 'a4')
  })
})

test.group('Roles, permisos y usuarios', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('un Vendedor no puede gestionar roles', async ({ client }) => {
    const admin = await crearUsuario()
    const empresa = await crearEmpresa(admin)
    const vendedor = await crearUsuario()
    await asignarRol(vendedor, empresa, 'Vendedor')
    const r = await client
      .get('/api/v1/roles')
      .loginAs(vendedor)
      .header('x-empresa-id', String(empresa.id))
    r.assertStatus(403)
    r.assertBodyContains({ permisos_faltantes: ['config.roles'] })
  })

  test('catálogo de permisos agrupado por módulo', async ({ client, assert }) => {
    const admin = await crearUsuario()
    const empresa = await crearEmpresa(admin)
    const r = await client
      .get('/api/v1/permisos')
      .loginAs(admin)
      .header('x-empresa-id', String(empresa.id))
    r.assertStatus(200)
    assert.properties(r.body(), ['ventas', 'compras', 'config'])
  })

  test('crea, edita, clona y elimina un rol', async ({ client, assert }) => {
    const admin = await crearUsuario()
    const empresa = await crearEmpresa(admin)
    const h = { 'x-empresa-id': String(empresa.id) }

    const creado = await client
      .post('/api/v1/roles')
      .loginAs(admin)
      .headers(h)
      .json({ nombre: 'Supervisor', permisos: ['ventas.ver', 'reportes.ver'] })
    creado.assertStatus(201)
    assert.sameMembers(creado.body().permisos, ['ventas.ver', 'reportes.ver'])

    const dup = await client
      .post('/api/v1/roles')
      .loginAs(admin)
      .headers(h)
      .json({ nombre: 'supervisor', permisos: [] })
    dup.assertStatus(422)

    const malo = await client
      .post('/api/v1/roles')
      .loginAs(admin)
      .headers(h)
      .json({ nombre: 'Raro', permisos: ['no.existe'] })
    malo.assertStatus(422)

    const editado = await client
      .put(`/api/v1/roles/${creado.body().id}`)
      .loginAs(admin)
      .headers(h)
      .json({ nombre: 'Supervisor de tienda', permisos: ['ventas.ver'] })
    editado.assertStatus(200)
    assert.deepEqual(editado.body().permisos, ['ventas.ver'])

    const copia = await client
      .post(`/api/v1/roles/${creado.body().id}/clonar`)
      .loginAs(admin)
      .headers(h)
    copia.assertStatus(201)
    assert.equal(copia.body().nombre, 'Supervisor de tienda (copia)')
    const copia2 = await client
      .post(`/api/v1/roles/${creado.body().id}/clonar`)
      .loginAs(admin)
      .headers(h)
    assert.equal(copia2.body().nombre, 'Supervisor de tienda (copia 2)')

    const lista = await client.get('/api/v1/roles').loginAs(admin).headers(h)
    assert.lengthOf(lista.body(), 10)
    assert.equal(lista.body().find((r: any) => r.nombre === 'Administrador').usuarios, 1)

    const borrar = await client.delete(`/api/v1/roles/${copia.body().id}`).loginAs(admin).headers(h)
    borrar.assertStatus(204)
  })

  test('protege el rol Administrador', async ({ client }) => {
    const admin = await crearUsuario()
    const empresa = await crearEmpresa(admin)
    const h = { 'x-empresa-id': String(empresa.id) }
    const rolAdmin = await Rol.query()
      .where({ empresaId: empresa.id, nombre: 'Administrador' })
      .firstOrFail()
    const borrar = await client.delete(`/api/v1/roles/${rolAdmin.id}`).loginAs(admin).headers(h)
    borrar.assertStatus(422)
    const renombrar = await client
      .put(`/api/v1/roles/${rolAdmin.id}`)
      .loginAs(admin)
      .headers(h)
      .json({ nombre: 'Jefe', permisos: [] })
    renombrar.assertStatus(422)
    const recortar = await client
      .put(`/api/v1/roles/${rolAdmin.id}`)
      .loginAs(admin)
      .headers(h)
      .json({ nombre: 'Administrador', permisos: ['ventas.ver'] })
    recortar.assertStatus(422)
  })

  test('no elimina un rol con usuarios asignados', async ({ client }) => {
    const admin = await crearUsuario()
    const empresa = await crearEmpresa(admin)
    const vendedor = await crearUsuario()
    await asignarRol(vendedor, empresa, 'Vendedor')
    const rol = await Rol.query().where({ empresaId: empresa.id, nombre: 'Vendedor' }).firstOrFail()
    const r = await client
      .delete(`/api/v1/roles/${rol.id}`)
      .loginAs(admin)
      .header('x-empresa-id', String(empresa.id))
    r.assertStatus(422)
  })

  test('agrega usuarios nuevos y existentes, y edita su rol y sucursales', async ({
    client,
    assert,
  }) => {
    const admin = await crearUsuario()
    const empresa = await crearEmpresa(admin)
    const h = { 'x-empresa-id': String(empresa.id) }
    const cajero = await Rol.query()
      .where({ empresaId: empresa.id, nombre: 'Cajero' })
      .firstOrFail()
    const sucursal = await Sucursal.query().where('empresa_id', empresa.id).firstOrFail()

    const sinPass = await client
      .post('/api/v1/usuarios')
      .loginAs(admin)
      .headers(h)
      .json({ nombre_completo: 'Luis Caja', email: 'luis@prueba.pe', rol_id: cajero.id })
    sinPass.assertStatus(422)

    const nuevo = await client
      .post('/api/v1/usuarios')
      .loginAs(admin)
      .headers(h)
      .json({
        nombre_completo: 'Luis Caja',
        email: 'luis@prueba.pe',
        password: 'clave-luis-1',
        rol_id: cajero.id,
        sucursal_ids: [sucursal.id],
      })
    nuevo.assertStatus(201)

    const repetido = await client
      .post('/api/v1/usuarios')
      .loginAs(admin)
      .headers(h)
      .json({ nombre_completo: 'Luis Caja', email: 'luis@prueba.pe', rol_id: cajero.id })
    repetido.assertStatus(422)

    const existente = await crearUsuario({ email: 'existe@prueba.pe' })
    const agregado = await client
      .post('/api/v1/usuarios')
      .loginAs(admin)
      .headers(h)
      .json({ nombre_completo: 'Existente', email: existente.email, rol_id: cajero.id })
    agregado.assertStatus(201)

    const rolAjeno = await client.post('/api/v1/usuarios').loginAs(admin).headers(h).json({
      nombre_completo: 'Yolanda',
      email: 'y@prueba.pe',
      password: 'clave-y-123',
      rol_id: 999999,
    })
    rolAjeno.assertStatus(422)
    const sucursalAjena = await client
      .post('/api/v1/usuarios')
      .loginAs(admin)
      .headers(h)
      .json({
        nombre_completo: 'Yolanda',
        email: 'y@prueba.pe',
        password: 'clave-y-123',
        rol_id: cajero.id,
        sucursal_ids: [999999],
      })
    sucursalAjena.assertStatus(422)

    const lista = await client.get('/api/v1/usuarios').loginAs(admin).headers(h)
    const luis = lista.body().find((m: any) => m.email === 'luis@prueba.pe')
    assert.deepEqual(luis.sucursal_ids, [sucursal.id])

    const vendedor = await Rol.query()
      .where({ empresaId: empresa.id, nombre: 'Vendedor' })
      .firstOrFail()
    const editar = await client
      .put(`/api/v1/usuarios/${luis.membresia_id}`)
      .loginAs(admin)
      .headers(h)
      .json({ rol_id: vendedor.id, sucursal_ids: [] })
    editar.assertStatus(200)
    const otraVez = await client.get('/api/v1/usuarios').loginAs(admin).headers(h)
    const luis2 = otraVez.body().find((m: any) => m.email === 'luis@prueba.pe')
    assert.equal(luis2.rol.nombre, 'Vendedor')
    assert.deepEqual(luis2.sucursal_ids, [])
  })

  test('la empresa no puede quedarse sin Administrador', async ({ client }) => {
    const admin = await crearUsuario()
    const empresa = await crearEmpresa(admin)
    const membresia = await UsuarioEmpresaRol.query()
      .where({ usuarioId: admin.id, empresaId: empresa.id })
      .firstOrFail()
    const r = await client
      .put(`/api/v1/usuarios/${membresia.id}`)
      .loginAs(admin)
      .header('x-empresa-id', String(empresa.id))
      .json({ activo: false })
    r.assertStatus(422)
  })
})

test.group('Sucursales y series', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.teardown(() => SunatGateway.usar(null))

  test('crea sucursal en SUNAT y localmente con almacén y caja', async ({ client, assert }) => {
    new SunatFalsa()
      .cuando('POST /sucursales', exito({ id: 88 }, 201))
      .cuando('PUT /sucursales/88', exito({ id: 88 }))
      .instalar()
    const admin = await crearUsuario()
    const empresa = await crearEmpresa(admin)
    const h = { 'x-empresa-id': String(empresa.id) }
    const r = await client.post('/api/v1/sucursales').loginAs(admin).headers(h).json({
      nombre: 'Tienda Norte',
      cod_local: '0001',
      direccion: 'Av. Norte 1',
      ubigeo: '150102',
    })
    r.assertStatus(201)
    assert.equal(r.body().sunat_sucursal_id, 88)

    const dup = await client
      .post('/api/v1/sucursales')
      .loginAs(admin)
      .headers(h)
      .json({ nombre: 'Otra', cod_local: '0001', direccion: 'X', ubigeo: '150102' })
    dup.assertStatus(422)

    const editar = await client
      .put(`/api/v1/sucursales/${r.body().id}`)
      .loginAs(admin)
      .headers(h)
      .json({
        nombre: 'Tienda Norte 2',
        cod_local: '0001',
        direccion: 'Av. Norte 2',
        ubigeo: '150102',
        formato_impresion: 'ticket-58',
        activo: false,
      })
    editar.assertStatus(200)
    assert.equal(editar.body().formato_impresion, 'ticket-58')

    const lista = await client.get('/api/v1/sucursales').loginAs(admin).headers(h)
    assert.lengthOf(lista.body(), 2)
  })

  test('crea series validando prefijo y duplicados', async ({ client, assert }) => {
    new SunatFalsa()
      .cuando('POST /series', exito({ creadas: [{ id: 12, serie: 'BD01' }] }, 201))
      .instalar()
    const admin = await crearUsuario()
    const empresa = await crearEmpresa(admin)
    const h = { 'x-empresa-id': String(empresa.id) }
    const sucursal = await Sucursal.query().where('empresa_id', empresa.id).firstOrFail()

    const mal = await client
      .post('/api/v1/series')
      .loginAs(admin)
      .headers(h)
      .json({ tipo_documento: '01', serie: 'B002', sucursal_id: sucursal.id })
    mal.assertStatus(422)
    const dup = await client
      .post('/api/v1/series')
      .loginAs(admin)
      .headers(h)
      .json({ tipo_documento: '01', serie: 'F001', sucursal_id: sucursal.id })
    dup.assertStatus(422)
    const ok = await client
      .post('/api/v1/series')
      .loginAs(admin)
      .headers(h)
      .json({ tipo_documento: '08', serie: 'bd01', sucursal_id: sucursal.id })
    ok.assertStatus(201)
    assert.equal(ok.body().serie, 'BD01')
    assert.equal(ok.body().sunat_serie_id, 12)
    const lista = await client.get('/api/v1/series').loginAs(admin).headers(h)
    assert.lengthOf(lista.body(), 7)
  })

  test('registro de auditoría consultable por el Administrador', async ({ client, assert }) => {
    const admin = await crearUsuario()
    const empresa = await crearEmpresa(admin)
    const h = { 'x-empresa-id': String(empresa.id) }
    await client
      .post('/api/v1/roles')
      .loginAs(admin)
      .headers(h)
      .json({ nombre: 'Auditado', permisos: [] })
    const r = await client.get('/api/v1/auditoria?entidad=rol').loginAs(admin).headers(h)
    r.assertStatus(200)
    assert.equal(r.body().data[0].accion, 'rol.crear')
  })
})
