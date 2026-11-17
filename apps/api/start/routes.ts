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
const CatalogoController = () => import('#controllers/catalogo_controller')
const ClientesController = () => import('#controllers/clientes_controller')
const ProveedoresController = () => import('#controllers/proveedores_controller')
const InventarioController = () => import('#controllers/inventario_controller')
const ComprasController = () => import('#controllers/compras_controller')

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

        // ---------------- Fase 3: catálogo, inventario, compras y cuentas por pagar
        const verProductos = p('inventario.ver|ventas.crear|compras.crear')
        router.get('categorias', [CatalogoController, 'categorias']).use(verProductos)
        router
          .post('categorias', [CatalogoController, 'crearCategoria'])
          .use(p('inventario.gestionar'))
        router
          .put('categorias/:id', [CatalogoController, 'actualizarCategoria'])
          .use(p('inventario.gestionar'))
        router.get('productos', [CatalogoController, 'productos']).use(verProductos)
        router.get('productos/:id', [CatalogoController, 'producto']).use(verProductos)
        router
          .post('productos', [CatalogoController, 'crearProducto'])
          .use(p('inventario.gestionar'))
        router
          .put('productos/:id', [CatalogoController, 'actualizarProducto'])
          .use(p('inventario.gestionar'))

        router.get('almacenes', [InventarioController, 'almacenes']).use(verProductos)
        router.get('inventario/kardex', [InventarioController, 'kardex']).use(p('inventario.ver'))
        router
          .post('inventario/ajustes', [InventarioController, 'ajuste'])
          .use(p('inventario.gestionar'))
        router
          .post('inventario/transferencias', [InventarioController, 'transferencia'])
          .use(p('inventario.gestionar'))

        router
          .get('proveedores', [ProveedoresController, 'index'])
          .use(p('compras.ver|proveedores.gestionar'))
        router
          .post('proveedores', [ProveedoresController, 'store'])
          .use(p('proveedores.gestionar|compras.crear'))
        router
          .put('proveedores/:id', [ProveedoresController, 'update'])
          .use(p('proveedores.gestionar'))
        router
          .get('clientes', [ClientesController, 'index'])
          .use(p('clientes.gestionar|ventas.crear|ventas.ver'))
        router
          .post('clientes', [ClientesController, 'store'])
          .use(p('clientes.gestionar|ventas.crear'))
        router.put('clientes/:id', [ClientesController, 'update']).use(p('clientes.gestionar'))

        router.get('ordenes-compra', [ComprasController, 'ordenes']).use(p('compras.ver'))
        router.get('ordenes-compra/:id', [ComprasController, 'orden']).use(p('compras.ver'))
        router.post('ordenes-compra', [ComprasController, 'crearOrden']).use(p('compras.crear'))
        router
          .post('ordenes-compra/:id/aprobar', [ComprasController, 'aprobarOrden'])
          .use(p('compras.aprobar'))
        router
          .post('ordenes-compra/:id/anular', [ComprasController, 'anularOrden'])
          .use(p('compras.anular'))
        router.get('compras', [ComprasController, 'index']).use(p('compras.ver'))
        router.get('compras/:id', [ComprasController, 'show']).use(p('compras.ver'))
        router.post('compras', [ComprasController, 'store']).use(p('compras.crear'))
        router.post('compras/:id/anular', [ComprasController, 'anular']).use(p('compras.anular'))
        router
          .get('cuentas-por-pagar', [ComprasController, 'cuentasPorPagar'])
          .use(p('cxp.gestionar'))
        router
          .post('cuentas-por-pagar/:id/pagos', [ComprasController, 'pagar'])
          .use(p('cxp.gestionar'))
      })
      .use([middleware.auth(), middleware.empresa()])
  })
  .prefix('/api/v1')
