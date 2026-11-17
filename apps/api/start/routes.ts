/*
|--------------------------------------------------------------------------
| Rutas de la API (/api/v1)
|--------------------------------------------------------------------------
| auth      → usuario autenticado (token)
| empresa   → además, empresa activa por cabecera X-Empresa-Id (aislamiento multiempresa)
| permiso   → además, el rol del usuario en esa empresa debe tener el permiso
*/

import router from '@adonisjs/core/services/router'
import db from '@adonisjs/lucid/services/db'
import { middleware } from '#start/kernel'

const AuthController = () => import('#controllers/auth_controller')
const PerfilController = () => import('#controllers/perfil_controller')
const EmpresasController = () => import('#controllers/empresas_controller')
const SucursalesController = () => import('#controllers/sucursales_controller')
const SeriesController = () => import('#controllers/series_controller')
const RolesController = () => import('#controllers/roles_controller')
const UsuariosController = () => import('#controllers/usuarios_controller')
const ComprobantesController = () => import('#controllers/comprobantes_controller')
const ConsultasController = () => import('#controllers/consultas_controller')
const AuditoriaController = () => import('#controllers/auditoria_controller')

router.get('/health', async ({ response }) => {
  try {
    await db.rawQuery('select 1')
    return { estado: 'ok' }
  } catch {
    return response.serviceUnavailable({ estado: 'sin_bd' })
  }
})

router
  .group(() => {
    // Públicas
    router.post('auth/registro', [AuthController, 'registro'])
    router.post('auth/login', [AuthController, 'login'])

    // Autenticado, sin empresa activa
    router
      .group(() => {
        router.post('auth/logout', [AuthController, 'logout'])
        router.get('auth/yo', [AuthController, 'yo'])
        router.get('perfil', [PerfilController, 'show'])
        router.put('perfil', [PerfilController, 'update'])
        router.put('perfil/password', [PerfilController, 'cambiarPassword'])
        router.post('empresas/registrar', [EmpresasController, 'registrar'])
        router.post('empresas/vincular', [EmpresasController, 'vincular'])
      })
      .use(middleware.auth())

    // Autenticado + empresa activa
    router
      .group(() => {
        const p = (...permisos: string[]) => middleware.permiso(permisos)

        router.get('empresa', [EmpresasController, 'show'])
        router.put('empresa', [EmpresasController, 'update']).use(p('config.empresa'))

        router.get('sucursales', [SucursalesController, 'index'])
        router.post('sucursales', [SucursalesController, 'store']).use(p('config.sucursales'))
        router.put('sucursales/:id', [SucursalesController, 'update']).use(p('config.sucursales'))

        router.get('series', [SeriesController, 'index'])
        router.post('series', [SeriesController, 'store']).use(p('config.series'))

        router.get('permisos', [RolesController, 'permisos']).use(p('config.roles'))
        router.get('roles', [RolesController, 'index']).use(p('config.roles'))
        router.post('roles', [RolesController, 'store']).use(p('config.roles'))
        router.put('roles/:id', [RolesController, 'update']).use(p('config.roles'))
        router.post('roles/:id/clonar', [RolesController, 'clonar']).use(p('config.roles'))
        router.delete('roles/:id', [RolesController, 'destroy']).use(p('config.roles'))

        router.get('usuarios', [UsuariosController, 'index']).use(p('config.usuarios'))
        router.post('usuarios', [UsuariosController, 'store']).use(p('config.usuarios'))
        router.put('usuarios/:id', [UsuariosController, 'update']).use(p('config.usuarios'))

        router.get('comprobantes', [ComprobantesController, 'index']).use(p('ventas.ver'))
        router
          .get('comprobantes/resumen-estados', [ComprobantesController, 'resumenEstados'])
          .use(p('ventas.ver'))
        router.post('comprobantes', [ComprobantesController, 'store']).use(p('comprobantes.emitir'))
        router.get('comprobantes/:id', [ComprobantesController, 'show']).use(p('ventas.ver'))
        router
          .post('comprobantes/:id/reconsultar', [ComprobantesController, 'reconsultar'])
          .use(p('ventas.ver'))
        router
          .post('comprobantes/:id/reenviar', [ComprobantesController, 'reenviar'])
          .use(p('comprobantes.emitir'))
        router.get('comprobantes/:id/pdf', [ComprobantesController, 'pdf']).use(p('ventas.ver'))
        router.get('comprobantes/:id/xml', [ComprobantesController, 'xml']).use(p('ventas.ver'))
        router.get('comprobantes/:id/cdr', [ComprobantesController, 'cdr']).use(p('ventas.ver'))

        router.get('consultas/documento', [ConsultasController, 'documento'])

        router.get('auditoria', [AuditoriaController, 'index']).use(p('auditoria.ver'))
      })
      .use([middleware.auth(), middleware.empresa()])
  })
  .prefix('/api/v1')
