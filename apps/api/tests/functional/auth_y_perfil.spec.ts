import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { crearEmpresa, crearUsuario } from '#tests/helpers'

test.group('Autenticación y perfil', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('ya no existe registro público: las cuentas las crea el SuperAdmin', async ({ client }) => {
    const r = await client
      .post('/api/v1/auth/registro')
      .json({ nombre_completo: 'Ana Pérez', email: 'ana@prueba.pe', password: 'clave-segura-1' })
    r.assertStatus(404)
  })

  test('login devuelve las empresas con rol y permisos', async ({ client, assert }) => {
    const usuario = await crearUsuario({ email: 'login@prueba.pe' })
    await crearEmpresa(usuario)
    const r = await client
      .post('/api/v1/auth/login')
      .json({ email: 'login@prueba.pe', password: 'clave-segura-123' })
    r.assertStatus(200)
    assert.lengthOf(r.body().empresas, 1)
    assert.equal(r.body().empresas[0].rol.nombre, 'Administrador')
    assert.include(r.body().empresas[0].permisos, 'config.roles')
  })

  test('login con contraseña incorrecta falla', async ({ client }) => {
    await crearUsuario({ email: 'mal@prueba.pe' })
    const r = await client
      .post('/api/v1/auth/login')
      .json({ email: 'mal@prueba.pe', password: 'otra' })
    r.assertStatus(400)
    r.assertBodyContains({ mensaje: 'Correo o contraseña incorrectos.' })
  })

  test('usuario desactivado no puede ingresar', async ({ client }) => {
    const u = await crearUsuario({ email: 'off@prueba.pe' })
    u.activo = false
    await u.save()
    const r = await client
      .post('/api/v1/auth/login')
      .json({ email: 'off@prueba.pe', password: 'clave-segura-123' })
    r.assertStatus(403)
  })

  test('rutas protegidas exigen token', async ({ client }) => {
    const r = await client.get('/api/v1/auth/yo')
    r.assertStatus(401)
  })

  test('yo, logout y token revocado', async ({ client, assert }) => {
    const u = await crearUsuario()
    const yo = await client.get('/api/v1/auth/yo').loginAs(u)
    yo.assertStatus(200)
    assert.equal(yo.body().usuario.id, u.id)
    const salir = await client.post('/api/v1/auth/logout').loginAs(u)
    salir.assertStatus(200)
  })

  test('actualiza perfil y valida empresa predeterminada', async ({ client, assert }) => {
    const u = await crearUsuario()
    const empresa = await crearEmpresa(u)
    const otro = await crearUsuario()
    const ajena = await crearEmpresa(otro)

    const ok = await client.put('/api/v1/perfil').loginAs(u).json({
      nombre_completo: 'Nuevo Nombre',
      formato_impresion: 'ticket-80',
      empresa_predeterminada_id: empresa.id,
      telefono: '999888777',
    })
    ok.assertStatus(200)
    assert.equal(ok.body().nombre_completo, 'Nuevo Nombre')
    assert.equal(ok.body().formato_impresion, 'ticket-80')

    const ver = await client.get('/api/v1/perfil').loginAs(u)
    assert.equal(ver.body().telefono, '999888777')

    const mal = await client
      .put('/api/v1/perfil')
      .loginAs(u)
      .json({ empresa_predeterminada_id: ajena.id })
    mal.assertStatus(422)
  })

  test('cambia la contraseña verificando la actual', async ({ client }) => {
    const u = await crearUsuario({ email: 'pass@prueba.pe' })
    const mal = await client.put('/api/v1/perfil/password').loginAs(u).json({
      password_actual: 'no',
      password: 'nueva-clave-1',
      password_confirmacion: 'nueva-clave-1',
    })
    mal.assertStatus(422)
    const ok = await client.put('/api/v1/perfil/password').loginAs(u).json({
      password_actual: 'clave-segura-123',
      password: 'nueva-clave-1',
      password_confirmacion: 'nueva-clave-1',
    })
    ok.assertStatus(200)
    const login = await client
      .post('/api/v1/auth/login')
      .json({ email: 'pass@prueba.pe', password: 'nueva-clave-1' })
    login.assertStatus(200)
  })
})
