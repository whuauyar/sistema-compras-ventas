/*
|--------------------------------------------------------------------------
| Rutas de la API (/api/v1)
|--------------------------------------------------------------------------
| auth      → usuario autenticado (token)
| empresa   → además, empresa activa por cabecera X-Empresa-Id (aislamiento multiempresa)
| permiso   → además, el rol del usuario en esa empresa debe tener el permiso
|             (y la empresa debe tenerlo habilitado por el SuperAdmin)
| superadmin→ consola de plataforma (/admin): empresas, topes de permisos, plantillas
|
| No hay registro público: el SuperAdmin da de alta las empresas y sus Administradores.
*/

import router from '@adonisjs/core/services/router'
import db from '@adonisjs/lucid/services/db'
import { middleware } from '#start/kernel'
import { limiteAcceso, limiteApi } from '#start/limiter'

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
const VentasController = () => import('#controllers/ventas_controller')
const CajaController = () => import('#controllers/caja_controller')
const DocumentosController = () => import('#controllers/documentos_controller')
const ReportesController = () => import('#controllers/reportes_controller')
const AdminController = () => import('#controllers/admin_controller')
const ConfiguracionSunatController = () => import('#controllers/configuracion_sunat_controller')

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
    router.post('auth/login', [AuthController, 'login']).use(limiteAcceso)

    // Autenticado, sin empresa activa
    router
      .group(() => {
        router.post('auth/logout', [AuthController, 'logout'])
        router.get('auth/yo', [AuthController, 'yo'])
        router.get('perfil', [PerfilController, 'show'])
        router.put('perfil', [PerfilController, 'update'])
        router.put('perfil/password', [PerfilController, 'cambiarPassword'])
      })
      .use(middleware.auth())

    // SuperAdmin de la plataforma
    router
      .group(() => {
        router.get('permisos', [AdminController, 'permisos'])
        router.get('empresas', [AdminController, 'empresas'])
        router.get('empresas/:id', [AdminController, 'empresa'])
        router.post('empresas/registrar', [AdminController, 'registrarEmpresa'])
        router.post('empresas/vincular', [AdminController, 'vincularEmpresa'])
        router.put('empresas/:id/estado', [AdminController, 'estadoEmpresa'])
        router.put('empresas/:id/permisos', [AdminController, 'permisosEmpresa'])
        router.get('empresas/:id/usuarios', [AdminController, 'usuarios'])
        router.post('empresas/:id/usuarios', [AdminController, 'agregarUsuario'])
        router.put('empresas/:id/usuarios/:membresiaId', [AdminController, 'actualizarUsuario'])
        router.get('plantillas', [AdminController, 'plantillas'])
        router.post('plantillas', [AdminController, 'crearPlantilla'])
        router.put('plantillas/:id', [AdminController, 'actualizarPlantilla'])
        router.delete('plantillas/:id', [AdminController, 'eliminarPlantilla'])
      })
      .prefix('admin')
      .use([middleware.auth(), limiteApi, middleware.superadmin()])

    // Autenticado + empresa activa
    router
      .group(() => {
        const p = (...permisos: string[]) => middleware.permiso(permisos)

        router.get('empresa', [EmpresasController, 'show'])
        router.put('empresa', [EmpresasController, 'update']).use(p('config.empresa'))
        // Configuración integral en la API SUNAT
        router
          .group(() => {
            router.get('', [ConfiguracionSunatController, 'show'])
            router.put('', [ConfiguracionSunatController, 'update'])
            router.post('certificado', [ConfiguracionSunatController, 'certificado'])
            router.post('logo', [ConfiguracionSunatController, 'logo'])
            router.post('credenciales/regenerar', [
              ConfiguracionSunatController,
              'regenerarCredenciales',
            ])
            router.post('sincronizar', [ConfiguracionSunatController, 'sincronizar'])
          })
          .prefix('empresa/sunat')
          .use(p('config.empresa'))
        router.get('catalogos/ubigeo/:nivel', [CatalogoController, 'ubigeo'])

        router.get('sucursales', [SucursalesController, 'index'])
        router.post('sucursales', [SucursalesController, 'store']).use(p('config.sucursales'))
        router.put('sucursales/:id', [SucursalesController, 'update']).use(p('config.sucursales'))

        router.get('series', [SeriesController, 'index'])
        router.post('series', [SeriesController, 'store']).use(p('config.series'))
        router.put('series/:id', [SeriesController, 'update']).use(p('config.series'))

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

        // ---------------- Fase 4: POS / ventas, caja y cuentas por cobrar
        router.get('ventas', [VentasController, 'index']).use(p('ventas.ver'))
        router.get('ventas/:id', [VentasController, 'show']).use(p('ventas.ver'))
        router
          .post('ventas', [VentasController, 'store'])
          .use(p('ventas.crear', 'comprobantes.emitir'))
        router
          .get('cuentas-por-cobrar', [VentasController, 'cuentasPorCobrar'])
          .use(p('cxc.gestionar'))
        router
          .post('cuentas-por-cobrar/:id/cobros', [VentasController, 'cobrar'])
          .use(p('cxc.gestionar'))

        router.get('cajas', [CajaController, 'index']).use(p('caja.operar|ventas.crear'))
        router.post('cajas/aperturas', [CajaController, 'abrir']).use(p('caja.operar'))
        router.get('cajas/aperturas', [CajaController, 'historial']).use(p('caja.operar'))
        router.get('cajas/aperturas/:id', [CajaController, 'show']).use(p('caja.operar'))
        router
          .post('cajas/aperturas/:id/movimientos', [CajaController, 'movimiento'])
          .use(p('caja.operar'))
        router.post('cajas/aperturas/:id/cerrar', [CajaController, 'cerrar']).use(p('caja.operar'))

        // ---------------- Fase 5: notas de crédito/débito, guías y anulaciones
        router.get('documentos/motivos', [DocumentosController, 'motivos']).use(p('ventas.ver'))
        router
          .get('comprobantes/:id/relacionados', [DocumentosController, 'relacionados'])
          .use(p('ventas.ver'))
        router
          .post('comprobantes/:id/nota-credito', [DocumentosController, 'notaCredito'])
          .use(p('comprobantes.emitir_nc'))
        router
          .post('comprobantes/:id/nota-debito', [DocumentosController, 'notaDebito'])
          .use(p('comprobantes.emitir_nd'))
        router.post('guias', [DocumentosController, 'guia']).use(p('guias.emitir'))
        router
          .get('anulaciones', [DocumentosController, 'anulaciones'])
          .use(p('comprobantes.anular'))
        router.post('anulaciones', [DocumentosController, 'anular']).use(p('comprobantes.anular'))
        router
          .post('anulaciones/:id/consultar', [DocumentosController, 'consultarAnulacion'])
          .use(p('comprobantes.anular'))

        // ---------------- Fase 6: dashboard y reportes
        router.get('dashboard', [ReportesController, 'dashboard']).use(p('reportes.ver'))
        router.get('reportes/:tipo', [ReportesController, 'show']).use(p('reportes.ver'))
      })
      .use([middleware.auth(), limiteApi, middleware.empresa()])
  })
  .prefix('/api/v1')
