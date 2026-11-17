import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import Auditoria from '#models/auditoria'
import Empresa from '#models/empresa'
import Rol from '#models/rol'
import RolPlantilla from '#models/rol_plantilla'
import Usuario from '#models/usuario'
import UsuarioEmpresaRol from '#models/usuario_empresa_rol'
import { CODIGOS_PERMISO } from '#constants/permisos'
import { SunatGateway } from '#integrations/sunat/sunat_service'
import {
  asegurarPlantillas,
  crearRolesPlantilla,
  habilitarPermisos,
} from '#services/permisos_service'
import { asegurarSuperadmin } from '#services/superadmin_service'
import MainSeeder from '#database/seeders/main_seeder'
import {
  SunatFalsa,
  asignarRol,
  crearEmpresa,
  crearSuperadmin,
  crearUsuario,
  exito,
} from '#tests/helpers'

const SIN_GUIAS = CODIGOS_PERMISO.filter((c) => c !== 'guias.emitir')

/** Empresa con tope de permisos pero aún sin roles (como justo antes de copiar las plantillas). */
async function empresaSinRoles(permisos: string[] = [...CODIGOS_PERMISO]) {
  return db.transaction(async (trx) => {
    const empresa = new Empresa()
    empresa.useTransaction(trx)
    empresa.merge({
      ruc: `20${String(Date.now()).slice(-9)}`,
      razonSocial: 'Sin Roles SAC',
      direccion: 'Av. 1',
      ubigeo: '150101',
      regimen: 'general',
      entorno: 'beta',
      greConfigurada: false,
      formatoImpresion: 'a4',
      permitirVentaSinStock: false,
      igvTasa: 0.18,
      activo: true,
    })
    empresa.establecerCredenciales('clave-sin-roles', 'secreto-sin-roles')
    await empresa.save()
    await habilitarPermisos(empresa.id, permisos, trx)
    return empresa
  })
}

test.group('SuperAdmin: acceso a la consola', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('un usuario normal no entra a /admin', async ({ client }) => {
    const u = await crearUsuario()
    await crearEmpresa(u)
    const r = await client.get('/api/v1/admin/empresas').loginAs(u)
    r.assertStatus(403)
    r.assertBodyContains({ mensaje: 'Solo el SuperAdmin de la plataforma.' })
  })

  test('sin token responde 401', async ({ client }) => {
    const r = await client.get('/api/v1/admin/empresas')
    r.assertStatus(401)
  })

  test('el login del SuperAdmin lo identifica y no trae empresas', async ({ client, assert }) => {
    const sa = await crearSuperadmin()
    const r = await client
      .post('/api/v1/auth/login')
      .json({ email: sa.email, password: 'clave-super-segura-123' })
    r.assertStatus(200)
    assert.isTrue(r.body().usuario.es_superadmin)
    assert.deepEqual(r.body().empresas, [])
  })

  test('catálogo de permisos agrupado por módulo', async ({ client, assert }) => {
    const r = await client.get('/api/v1/admin/permisos').loginAs(await crearSuperadmin())
    r.assertStatus(200)
    assert.includeMembers(Object.keys(r.body()), ['ventas', 'compras', 'config', 'guias'])
    assert.equal(
      Object.values(r.body()).flat().length,
      CODIGOS_PERMISO.length,
      'trae el catálogo completo'
    )
  })
})

test.group('SuperAdmin: empresas', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.teardown(() => SunatGateway.usar(null))

  test('lista empresas con usuarios activos y permisos habilitados', async ({ client, assert }) => {
    const admin = await crearUsuario()
    const empresa = await crearEmpresa(admin)
    await asignarRol(await crearUsuario(), empresa, 'Vendedor')
    const r = await client.get('/api/v1/admin/empresas').loginAs(await crearSuperadmin())
    r.assertStatus(200)
    const fila = r.body().find((e: any) => e.id === empresa.id)
    assert.equal(fila.usuarios, 2)
    assert.equal(fila.permisos_habilitados, CODIGOS_PERMISO.length)
    assert.isTrue(fila.activo)
  })

  test('detalle con permisos habilitados y roles, sin exponer credenciales', async ({
    client,
    assert,
  }) => {
    const empresa = await crearEmpresa(await crearUsuario())
    const r = await client
      .get(`/api/v1/admin/empresas/${empresa.id}`)
      .loginAs(await crearSuperadmin())
    r.assertStatus(200)
    assert.lengthOf(r.body().permisos, CODIGOS_PERMISO.length)
    assert.lengthOf(r.body().roles, 7)
    assert.notProperty(r.body().empresa, 'sunat_api_secret_cifrada')
    assert.match(r.body().empresa.sunat_api_key, /••••/)
  })

  test('empresa inexistente responde 404', async ({ client }) => {
    const r = await client.get('/api/v1/admin/empresas/999999').loginAs(await crearSuperadmin())
    r.assertStatus(404)
  })

  test('vincular con un usuario existente lo hace Administrador sin pedir contraseña', async ({
    client,
    assert,
  }) => {
    new SunatFalsa()
      .cuando('GET /empresa', exito({ ruc: '20608888888', razon_social: 'EXISTE SAC' }))
      .cuando('GET /sucursales', exito([{ id: 1, cod_local: '0000', es_principal: true }]))
      .cuando('POST /series', exito({ creadas: [{ id: 1 }] }, 201))
      .instalar()
    const existente = await crearUsuario({ email: 'ya-existe@prueba.pe' })
    const otra = await crearEmpresa(existente)
    existente.empresaPredeterminadaId = otra.id
    await existente.save()
    const r = await client
      .post('/api/v1/admin/empresas/vincular')
      .loginAs(await crearSuperadmin())
      .json({
        api_key: 'clave-api-123',
        api_secret: 'secreto-api-123',
        admin_nombre: 'Ignorado',
        admin_email: 'ya-existe@prueba.pe',
      })
    r.assertStatus(201)
    const empresa = await Empresa.findByOrFail('ruc', '20608888888')
    assert.exists(
      await UsuarioEmpresaRol.query()
        .where({ usuarioId: existente.id, empresaId: empresa.id })
        .first()
    )
    await existente.refresh()
    assert.equal(existente.empresaPredeterminadaId, otra.id, 'conserva su empresa predeterminada')
    assert.notEqual(existente.nombreCompleto, 'Ignorado', 'no se sobrescriben sus datos')
  })

  test('un correo nuevo exige contraseña inicial y no llama a la API', async ({
    client,
    assert,
  }) => {
    const falsa = new SunatFalsa().instalar()
    const r = await client
      .post('/api/v1/admin/empresas/vincular')
      .loginAs(await crearSuperadmin())
      .json({
        api_key: 'clave-api-123',
        api_secret: 'secreto-api-123',
        admin_nombre: 'Sin Clave',
        admin_email: 'sin-clave@prueba.pe',
      })
    r.assertStatus(422)
    r.assertBodyContains({ errores: [{ campo: 'admin_password' }] })
    assert.lengthOf(falsa.llamadas, 0)
  })

  test('el SuperAdmin no puede quedar como Administrador de una empresa', async ({ client }) => {
    new SunatFalsa().instalar()
    const sa = await crearSuperadmin()
    const r = await client.post('/api/v1/admin/empresas/vincular').loginAs(sa).json({
      api_key: 'clave-api-123',
      api_secret: 'secreto-api-123',
      admin_nombre: 'Yo mismo',
      admin_email: sa.email,
    })
    r.assertStatus(422)
    r.assertBodyContains({ errores: [{ campo: 'admin_email' }] })
  })

  test('registrar exige los datos del Administrador', async ({ client }) => {
    new SunatFalsa().instalar()
    const r = await client
      .post('/api/v1/admin/empresas/registrar')
      .loginAs(await crearSuperadmin())
      .fields({
        ruc: '20605555557',
        razon_social: 'X SAC',
        direccion: 'D',
        ubigeo: '150101',
        sol_user: 'U',
        sol_pass: 'P',
        entorno: 'beta',
        regimen: 'general',
      })
      .file('certificado', Buffer.from('cert'), { filename: 'cert.pfx' })
    r.assertStatus(422)
    r.assertBodyContains({ errores: [{ campo: 'admin_nombre' }] })
  })

  test('suspender bloquea a todos sus usuarios y reactivar los devuelve', async ({
    client,
    assert,
  }) => {
    const admin = await crearUsuario()
    const empresa = await crearEmpresa(admin)
    const sa = await crearSuperadmin()

    const s = await client
      .put(`/api/v1/admin/empresas/${empresa.id}/estado`)
      .loginAs(sa)
      .json({ activo: false })
    s.assertStatus(200)
    assert.isFalse(s.body().activo)

    const bloqueado = await client
      .get('/api/v1/empresa')
      .loginAs(admin)
      .header('x-empresa-id', String(empresa.id))
    bloqueado.assertStatus(403)
    bloqueado.assertBodyContains({
      mensaje: 'La empresa está suspendida. Contacte al administrador de la plataforma.',
    })
    const sesion = await client.get('/api/v1/auth/yo').loginAs(admin)
    assert.deepEqual(sesion.body().empresas, [])

    await client
      .put(`/api/v1/admin/empresas/${empresa.id}/estado`)
      .loginAs(sa)
      .json({ activo: true })
    const ok = await client
      .get('/api/v1/empresa')
      .loginAs(admin)
      .header('x-empresa-id', String(empresa.id))
    ok.assertStatus(200)

    const acciones = (await Auditoria.query().where('empresa_id', empresa.id)).map((a) => a.accion)
    assert.includeMembers(acciones, ['empresa.suspender', 'empresa.activar'])
  })

  test('estado exige un booleano', async ({ client }) => {
    const empresa = await crearEmpresa(await crearUsuario())
    const r = await client
      .put(`/api/v1/admin/empresas/${empresa.id}/estado`)
      .loginAs(await crearSuperadmin())
      .json({})
    r.assertStatus(422)
  })
})

test.group('SuperAdmin: tope de permisos por empresa', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('quitar un permiso lo saca de los roles y de la sesión', async ({ client, assert }) => {
    const admin = await crearUsuario()
    const empresa = await crearEmpresa(admin)
    const almacenero = await crearUsuario()
    await asignarRol(almacenero, empresa, 'Almacenero')

    const r = await client
      .put(`/api/v1/admin/empresas/${empresa.id}/permisos`)
      .loginAs(await crearSuperadmin())
      .json({ permisos: SIN_GUIAS })
    r.assertStatus(200)
    assert.notInclude(r.body().permisos, 'guias.emitir')

    const rolAlmacen = await Rol.query()
      .where({ empresaId: empresa.id, nombre: 'Almacenero' })
      .preload('permisos')
      .firstOrFail()
    assert.notInclude(
      rolAlmacen.permisos.map((p) => p.codigo),
      'guias.emitir'
    )
    const sesion = await client.get('/api/v1/auth/yo').loginAs(admin)
    assert.notInclude(sesion.body().empresas[0].permisos, 'guias.emitir')

    const guia = await client
      .post('/api/v1/guias')
      .loginAs(admin)
      .header('x-empresa-id', String(empresa.id))
      .json({})
    guia.assertStatus(403)
    assert.exists(
      await Auditoria.query().where({ empresaId: empresa.id, accion: 'empresa.permisos' }).first()
    )
  })

  test('el permiso vale aunque el rol aún lo tenga, si la empresa no lo habilita', async ({
    client,
  }) => {
    const admin = await crearUsuario()
    const empresa = await crearEmpresa(admin)
    // Se recorta el tope directo en BD (sin pasar por la limpieza de roles)
    await db
      .from('empresa_permiso')
      .where('empresa_id', empresa.id)
      .whereIn('permiso_id', db.from('permisos').where('codigo', 'reportes.ver').select('id'))
      .delete()
    const r = await client
      .get('/api/v1/dashboard')
      .loginAs(admin)
      .header('x-empresa-id', String(empresa.id))
    r.assertStatus(403)
  })

  test('el Administrador de la empresa solo ve y asigna permisos habilitados', async ({
    client,
    assert,
  }) => {
    const admin = await crearUsuario()
    const empresa = await crearEmpresa(admin)
    await client
      .put(`/api/v1/admin/empresas/${empresa.id}/permisos`)
      .loginAs(await crearSuperadmin())
      .json({ permisos: SIN_GUIAS })

    const cabecera = String(empresa.id)
    const matriz = await client
      .get('/api/v1/permisos')
      .loginAs(admin)
      .header('x-empresa-id', cabecera)
    assert.notProperty(matriz.body(), 'guias')

    const rol = await client
      .post('/api/v1/roles')
      .loginAs(admin)
      .header('x-empresa-id', cabecera)
      .json({ nombre: 'Despachador', permisos: ['guias.emitir'] })
    rol.assertStatus(422)
    rol.assertBodyContains({ errores: [{ mensaje: 'No habilitado: guias.emitir' }] })

    const rolAdmin = await Rol.query()
      .where({ empresaId: empresa.id, esSistema: true })
      .firstOrFail()
    const actualizado = await client
      .put(`/api/v1/roles/${rolAdmin.id}`)
      .loginAs(admin)
      .header('x-empresa-id', cabecera)
      .json({ nombre: 'Administrador', permisos: SIN_GUIAS })
    actualizado.assertStatus(200)
  })

  test('volver a habilitar un permiso lo devuelve al Administrador', async ({ client, assert }) => {
    const empresa = await crearEmpresa(await crearUsuario())
    const sa = await crearSuperadmin()
    await client
      .put(`/api/v1/admin/empresas/${empresa.id}/permisos`)
      .loginAs(sa)
      .json({ permisos: SIN_GUIAS })
    await client
      .put(`/api/v1/admin/empresas/${empresa.id}/permisos`)
      .loginAs(sa)
      .json({ permisos: CODIGOS_PERMISO })
    const rolAdmin = await Rol.query()
      .where({ empresaId: empresa.id, esSistema: true })
      .preload('permisos')
      .firstOrFail()
    assert.include(
      rolAdmin.permisos.map((p) => p.codigo),
      'guias.emitir'
    )
    const almacen = await Rol.query()
      .where({ empresaId: empresa.id, nombre: 'Almacenero' })
      .preload('permisos')
      .firstOrFail()
    assert.notInclude(
      almacen.permisos.map((p) => p.codigo),
      'guias.emitir',
      'los demás roles no recuperan solos lo que perdieron'
    )
  })

  test('dejar la empresa sin permisos vacía todos sus roles', async ({ client, assert }) => {
    const empresa = await crearEmpresa(await crearUsuario())
    const r = await client
      .put(`/api/v1/admin/empresas/${empresa.id}/permisos`)
      .loginAs(await crearSuperadmin())
      .json({ permisos: [] })
    r.assertStatus(200)
    assert.deepEqual(r.body().permisos, [])
    const total = await db
      .from('rol_permiso')
      .whereIn('rol_id', db.from('roles').where('empresa_id', empresa.id).select('id'))
      .count('* as t')
      .first()
    assert.equal(Number(total.t), 0)
  })

  test('rechaza permisos desconocidos', async ({ client }) => {
    const empresa = await crearEmpresa(await crearUsuario())
    const r = await client
      .put(`/api/v1/admin/empresas/${empresa.id}/permisos`)
      .loginAs(await crearSuperadmin())
      .json({ permisos: ['no.existe'] })
    r.assertStatus(422)
    r.assertBodyContains({ errores: [{ mensaje: 'Permiso desconocido: no.existe' }] })
  })
})

test.group('SuperAdmin: usuarios de cualquier empresa', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('crea, lista y desactiva usuarios de una empresa', async ({ client, assert }) => {
    const admin = await crearUsuario()
    const empresa = await crearEmpresa(admin)
    const sa = await crearSuperadmin()
    const vendedor = await Rol.query()
      .where({ empresaId: empresa.id, nombre: 'Vendedor' })
      .firstOrFail()

    const alta = await client
      .post(`/api/v1/admin/empresas/${empresa.id}/usuarios`)
      .loginAs(sa)
      .json({
        nombre_completo: 'Vera Vendedora',
        email: 'vera@prueba.pe',
        password: 'clave-vera-123',
        rol_id: vendedor.id,
      })
    alta.assertStatus(201)

    const lista = await client.get(`/api/v1/admin/empresas/${empresa.id}/usuarios`).loginAs(sa)
    assert.lengthOf(lista.body(), 2)
    const vera = lista.body().find((u: any) => u.email === 'vera@prueba.pe')
    assert.equal(vera.rol.nombre, 'Vendedor')

    const baja = await client
      .put(`/api/v1/admin/empresas/${empresa.id}/usuarios/${vera.membresia_id}`)
      .loginAs(sa)
      .json({ activo: false })
    baja.assertStatus(200)
    const membresia = await UsuarioEmpresaRol.findOrFail(vera.membresia_id)
    assert.isFalse(membresia.activo)
    const evento = await Auditoria.query()
      .where({ empresaId: empresa.id, accion: 'usuario.agregar' })
      .firstOrFail()
    assert.equal(evento.usuarioId, sa.id, 'la auditoría registra al SuperAdmin')
  })

  test('no deja la empresa sin Administrador', async ({ client }) => {
    const admin = await crearUsuario()
    const empresa = await crearEmpresa(admin)
    const membresia = await UsuarioEmpresaRol.query()
      .where({ usuarioId: admin.id, empresaId: empresa.id })
      .firstOrFail()
    const r = await client
      .put(`/api/v1/admin/empresas/${empresa.id}/usuarios/${membresia.id}`)
      .loginAs(await crearSuperadmin())
      .json({ activo: false })
    r.assertStatus(422)
  })

  test('no agrega al SuperAdmin como miembro de una empresa', async ({ client }) => {
    const empresa = await crearEmpresa(await crearUsuario())
    const sa = await crearSuperadmin()
    const rol = await Rol.query().where({ empresaId: empresa.id, nombre: 'Cajero' }).firstOrFail()
    const r = await client
      .post(`/api/v1/admin/empresas/${empresa.id}/usuarios`)
      .loginAs(sa)
      .json({ nombre_completo: 'Super', email: sa.email, rol_id: rol.id })
    r.assertStatus(422)
    r.assertBodyContains({ mensaje: 'El SuperAdmin no puede pertenecer a una empresa.' })
  })

  test('valida rol y membresía de otra empresa', async ({ client }) => {
    const empresa = await crearEmpresa(await crearUsuario())
    const otra = await crearEmpresa(await crearUsuario())
    const rolAjeno = await Rol.query().where({ empresaId: otra.id, nombre: 'Cajero' }).firstOrFail()
    const sa = await crearSuperadmin()
    const r = await client.post(`/api/v1/admin/empresas/${empresa.id}/usuarios`).loginAs(sa).json({
      nombre_completo: 'X Y Z',
      email: 'x@prueba.pe',
      password: 'clave-x-1234',
      rol_id: rolAjeno.id,
    })
    r.assertStatus(422)
    const membresiaAjena = await UsuarioEmpresaRol.query()
      .where('empresa_id', otra.id)
      .firstOrFail()
    const u = await client
      .put(`/api/v1/admin/empresas/${empresa.id}/usuarios/${membresiaAjena.id}`)
      .loginAs(sa)
      .json({ activo: false })
    u.assertStatus(404)
  })
})

test.group('SuperAdmin: roles plantilla globales', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('lista las 7 plantillas base', async ({ client, assert }) => {
    const r = await client.get('/api/v1/admin/plantillas').loginAs(await crearSuperadmin())
    r.assertStatus(200)
    assert.includeMembers(
      r.body().map((p: any) => p.nombre),
      ['Administrador', 'Vendedor', 'Cajero', 'Comprador', 'Almacenero', 'Contador', 'Solo lectura']
    )
  })

  test('una plantilla nueva se copia a las empresas que se crean después', async ({
    client,
    assert,
  }) => {
    const sa = await crearSuperadmin()
    const antes = await crearEmpresa(await crearUsuario())
    const r = await client
      .post('/api/v1/admin/plantillas')
      .loginAs(sa)
      .json({
        nombre: 'Delivery',
        descripcion: 'Despacho',
        permisos: ['guias.emitir', 'ventas.ver'],
      })
    r.assertStatus(201)
    assert.deepEqual(r.body().permisos.sort(), ['guias.emitir', 'ventas.ver'])

    const despues = await crearEmpresa(await crearUsuario())
    const rol = await Rol.query()
      .where({ empresaId: despues.id, nombre: 'Delivery' })
      .preload('permisos')
      .firstOrFail()
    assert.lengthOf(rol.permisos, 2)
    assert.notExists(await Rol.query().where({ empresaId: antes.id, nombre: 'Delivery' }).first())
  })

  test('las plantillas se recortan al tope de la empresa nueva', async ({ assert }) => {
    const empresa = await empresaSinRoles(SIN_GUIAS)
    await db.transaction((trx) => crearRolesPlantilla(empresa.id, trx))
    const roles = await Rol.query().where('empresa_id', empresa.id).preload('permisos')
    assert.lengthOf(roles, 7)
    for (const rol of roles) {
      assert.notInclude(
        rol.permisos.map((p) => p.codigo),
        'guias.emitir',
        rol.nombre
      )
    }
    const admin = roles.find((r) => r.esSistema)!
    assert.lengthOf(admin.permisos, SIN_GUIAS.length)
  })

  test('edita y elimina plantillas; protege la de Administrador', async ({ client, assert }) => {
    const sa = await crearSuperadmin()
    const lectura = await RolPlantilla.findByOrFail('nombre', 'Solo lectura')
    const editada = await client
      .put(`/api/v1/admin/plantillas/${lectura.id}`)
      .loginAs(sa)
      .json({ nombre: 'Consulta', permisos: ['ventas.ver'] })
    editada.assertStatus(200)
    assert.deepEqual(editada.body().permisos, ['ventas.ver'])

    const mismo = await client
      .put(`/api/v1/admin/plantillas/${lectura.id}`)
      .loginAs(sa)
      .json({ nombre: 'Consulta', descripcion: 'Solo ver', permisos: ['ventas.ver'] })
    mismo.assertStatus(200)

    const admin = await RolPlantilla.findByOrFail('nombre', 'Administrador')
    const renombrar = await client
      .put(`/api/v1/admin/plantillas/${admin.id}`)
      .loginAs(sa)
      .json({ nombre: 'Jefe', permisos: [] })
    renombrar.assertStatus(422)
    const descripcion = await client
      .put(`/api/v1/admin/plantillas/${admin.id}`)
      .loginAs(sa)
      .json({ nombre: 'Administrador', descripcion: 'Todo', permisos: [] })
    descripcion.assertStatus(200)
    assert.equal(descripcion.body().descripcion, 'Todo')
    assert.isAbove(descripcion.body().permisos.length, 0, 'sus permisos no se tocan')

    const borrarAdmin = await client.delete(`/api/v1/admin/plantillas/${admin.id}`).loginAs(sa)
    borrarAdmin.assertStatus(422)
    const borrar = await client.delete(`/api/v1/admin/plantillas/${lectura.id}`).loginAs(sa)
    borrar.assertStatus(204)
    assert.notExists(await RolPlantilla.find(lectura.id))
    assert.exists(await Auditoria.query().where('accion', 'plantilla.eliminar').first())
  })

  test('nombres de plantilla únicos', async ({ client }) => {
    const sa = await crearSuperadmin()
    const dup = await client
      .post('/api/v1/admin/plantillas')
      .loginAs(sa)
      .json({ nombre: 'cajero', permisos: [] })
    dup.assertStatus(422)
    const vendedor = await RolPlantilla.findByOrFail('nombre', 'Vendedor')
    const renombrar = await client
      .put(`/api/v1/admin/plantillas/${vendedor.id}`)
      .loginAs(sa)
      .json({ nombre: 'Cajero', permisos: [] })
    renombrar.assertStatus(422)
  })

  test('sin plantilla Administrador no se pueden crear roles de empresa', async ({ assert }) => {
    const empresa = await empresaSinRoles()
    await RolPlantilla.query().where('es_sistema', true).delete()
    await assert.rejects(
      () => db.transaction((trx) => crearRolesPlantilla(empresa.id, trx)),
      'Falta la plantilla de rol Administrador.'
    )
  })

  test('asegurarPlantillas siembra solo si la tabla está vacía', async ({ assert }) => {
    await RolPlantilla.query().delete()
    await asegurarPlantillas()
    assert.lengthOf(await RolPlantilla.all(), 7)
    await asegurarPlantillas()
    assert.lengthOf(await RolPlantilla.all(), 7)
  })
})

test.group('SuperAdmin: creación desde variables de entorno', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('sin correo no hace nada', async ({ assert }) => {
    assert.equal(await asegurarSuperadmin({}), 'omitido')
  })

  test('correo nuevo sin contraseña robusta no crea nada', async ({ assert }) => {
    assert.equal(
      await asegurarSuperadmin({ email: 'sa@plataforma.pe', password: 'corta' }),
      'sin_password'
    )
    assert.equal(await asegurarSuperadmin({ email: 'sa@plataforma.pe' }), 'sin_password')
    assert.isNull(await Usuario.findBy('email', 'sa@plataforma.pe'))
  })

  test('crea el SuperAdmin y luego lo reconoce como existente', async ({ assert }) => {
    assert.equal(
      await asegurarSuperadmin({
        email: '  SA@Plataforma.pe ',
        password: 'una-clave-muy-larga',
        nombre: 'Dueño',
      }),
      'creado'
    )
    const sa = await Usuario.findByOrFail('email', 'sa@plataforma.pe')
    assert.isTrue(sa.esSuperadmin)
    assert.equal(sa.nombreCompleto, 'Dueño')
    assert.equal(
      await asegurarSuperadmin({ email: 'sa@plataforma.pe', password: 'otra-clave-distinta' }),
      'existente'
    )
  })

  test('sin nombre usa "SuperAdmin"', async ({ assert }) => {
    await asegurarSuperadmin({ email: 'sin-nombre@plataforma.pe', password: 'una-clave-muy-larga' })
    const sa = await Usuario.findByOrFail('email', 'sin-nombre@plataforma.pe')
    assert.equal(sa.nombreCompleto, 'SuperAdmin')
  })

  test('promueve un usuario existente sin cambiar su contraseña', async ({ assert }) => {
    const u = await crearUsuario({ email: 'promover@prueba.pe' })
    const hashAntes = u.password
    assert.equal(
      await asegurarSuperadmin({ email: 'promover@prueba.pe', password: 'otra-clave-larga' }),
      'promovido'
    )
    await u.refresh()
    assert.isTrue(u.esSuperadmin)
    assert.equal(u.password, hashAntes)
  })

  test('el seeder es idempotente y registra el resultado', async ({ assert }) => {
    const seeder = new MainSeeder(db.connection())
    await seeder.run()
    await seeder.run()
    assert.lengthOf(await RolPlantilla.all(), 7)
  })
})
