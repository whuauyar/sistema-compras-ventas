import { useState, type ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Ban,
  Building2,
  ClipboardList,
  Factory,
  HandCoins,
  History,
  Landmark,
  LayoutDashboard,
  MonitorSmartphone,
  Receipt,
  ScrollText,
  Truck,
  UserCog,
  Wallet,
  ChartColumn,
  ChevronsUpDown,
  FilePlus2,
  FileText,
  GitBranch,
  Hash,
  LogOut,
  Menu,
  Package,
  ShieldCheck,
  ShoppingCart,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { useSesion } from '@/lib/sesion'
import { cn } from '@/lib/utils'
import { Insignia } from './ui'

interface Item {
  a: string
  texto: string
  icono: ReactNode
  permiso?: string
  /** Texto corto que explica el paso dentro del flujo. */
  ayuda?: string
}

interface Grupo {
  grupo: string
  /** Si es un flujo, sus ítems se numeran en orden (inicio → fin). */
  flujo?: string
  items: Item[]
}

/**
 * Menú ordenado por flujo de trabajo:
 * Compras: proveedor → orden → recepción/registro → pago.
 * Inventario: lo que entra por compras y sale por ventas.
 * Ventas: cliente → caja → venta/comprobante → despacho → SUNAT → cobro → anulación → historial.
 */
const MENU: Grupo[] = [
  {
    grupo: 'Inicio',
    items: [{ a: '/gestion', texto: 'Dashboard', icono: <LayoutDashboard />, permiso: 'reportes.ver' }],
  },
  {
    grupo: 'Compras',
    flujo: 'inicio → fin',
    items: [
      { a: '/compras/proveedores', texto: 'Proveedores', icono: <Factory />, permiso: 'proveedores.gestionar|compras.ver', ayuda: 'Registrar o elegir al proveedor' },
      { a: '/compras/ordenes', texto: 'Órdenes de compra', icono: <ClipboardList />, permiso: 'compras.ver', ayuda: 'Pedir la mercadería' },
      { a: '/compras', texto: 'Registrar compra', icono: <ShoppingCart />, permiso: 'compras.ver', ayuda: 'Factura del proveedor e ingreso al almacén' },
      { a: '/compras/cuentas-por-pagar', texto: 'Cuentas por pagar', icono: <Landmark />, permiso: 'cxp.gestionar', ayuda: 'Pagar las compras al crédito' },
    ],
  },
  {
    grupo: 'Inventario',
    items: [
      { a: '/inventario', texto: 'Productos y stock', icono: <Package />, permiso: 'inventario.ver', ayuda: 'Catálogo, precios y existencias' },
      { a: '/inventario/kardex', texto: 'Kardex', icono: <ScrollText />, permiso: 'inventario.ver', ayuda: 'Entradas y salidas valorizadas' },
    ],
  },
  {
    grupo: 'Ventas',
    flujo: 'inicio → fin',
    items: [
      { a: '/ventas/clientes', texto: 'Clientes', icono: <Users />, permiso: 'clientes.gestionar', ayuda: 'Registrar o elegir al cliente' },
      { a: '/ventas/caja', texto: 'Caja', icono: <Wallet />, permiso: 'caja.operar', ayuda: 'Abrir la caja al empezar y cerrarla al final del turno' },
      { a: '/ventas/pos', texto: 'Punto de venta', icono: <MonitorSmartphone />, permiso: 'ventas.crear', ayuda: 'Vender y emitir boleta o factura' },
      { a: '/ventas/emitir', texto: 'Comprobante manual', icono: <FilePlus2 />, permiso: 'comprobantes.emitir', ayuda: 'Emitir sin pasar por el punto de venta' },
      { a: '/ventas/guias', texto: 'Guías de remisión', icono: <Truck />, permiso: 'guias.emitir', ayuda: 'Despachar la mercadería' },
      { a: '/ventas/comprobantes', texto: 'Comprobantes', icono: <FileText />, permiso: 'ventas.ver', ayuda: 'Estado en SUNAT, PDF, XML y CDR' },
      { a: '/ventas/cuentas-por-cobrar', texto: 'Cuentas por cobrar', icono: <HandCoins />, permiso: 'cxc.gestionar', ayuda: 'Cobrar las ventas al crédito' },
      { a: '/ventas/anulaciones', texto: 'Anulaciones', icono: <Ban />, permiso: 'comprobantes.anular', ayuda: 'Dar de baja comprobantes ante SUNAT' },
      { a: '/ventas', texto: 'Historial de ventas', icono: <Receipt />, permiso: 'ventas.ver', ayuda: 'Todas las ventas registradas' },
    ],
  },
  {
    grupo: 'Gestión',
    items: [
      { a: '/gestion/reportes', texto: 'Reportes', icono: <ChartColumn />, permiso: 'reportes.ver' },
      { a: '/gestion/auditoria', texto: 'Auditoría', icono: <History />, permiso: 'auditoria.ver' },
    ],
  },
  {
    grupo: 'Configuración',
    items: [
      { a: '/config/empresa', texto: 'Empresa', icono: <Building2 />, ayuda: 'Datos SUNAT, certificado y logo' },
      { a: '/config/sucursales', texto: 'Sucursales', icono: <GitBranch /> },
      { a: '/config/series', texto: 'Series', icono: <Hash /> },
      { a: '/config/usuarios', texto: 'Usuarios', icono: <UserCog />, permiso: 'config.usuarios' },
      { a: '/config/roles', texto: 'Roles y permisos', icono: <ShieldCheck />, permiso: 'config.roles' },
    ],
  },
]

export function Layout() {
  const { usuario, empresa, empresas, cambiarEmpresa, puede, salir } = useSesion()
  const [menuMovil, setMenuMovil] = useState(false)
  const navegar = useNavigate()

  const lateral = (
    <nav className="flex flex-col gap-5 p-3">
      {MENU.map(({ grupo, flujo, items }) => {
        // Se numeran solo los pasos que el usuario ve, para que su flujo quede 1, 2, 3…
        const visibles = items.filter((i) => !i.permiso || puede(i.permiso))
        if (visibles.length === 0) return null
        return (
          <div key={grupo}>
            <p className="flex items-baseline gap-1.5 px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {grupo}
              {flujo && <span className="font-normal normal-case tracking-normal text-slate-400">· {flujo}</span>}
            </p>
            <div className={cn(flujo && 'relative before:absolute before:bottom-3 before:left-[1.05rem] before:top-3 before:w-px before:bg-slate-200')}>
              {visibles.map((i, n) => (
                <NavLink
                  key={i.a}
                  to={i.a}
                  end
                  title={i.ayuda}
                  onClick={() => setMenuMovil(false)}
                  className={({ isActive }) =>
                    cn(
                      'relative flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 [&_svg]:size-4',
                      isActive && 'bg-acento-50 font-medium text-acento-700 hover:bg-acento-50'
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {flujo ? (
                        <span
                          className={cn(
                            'z-10 grid size-[1.15rem] shrink-0 place-items-center rounded-full border bg-white text-[10px] font-semibold tabular-nums',
                            isActive ? 'border-acento-600 bg-acento-600 text-white' : 'border-slate-300 text-slate-500'
                          )}
                        >
                          {n + 1}
                        </span>
                      ) : (
                        i.icono
                      )}
                      <span className="truncate">{i.texto}</span>
                      {flujo && <span className="ml-auto text-slate-400 opacity-70 [&_svg]:size-3.5">{i.icono}</span>}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        )
      })}
    </nav>
  )

  return (
    <div className="flex h-full">
      <aside className="no-imprimir hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-4 font-semibold text-slate-900">
          <span className="grid size-7 place-items-center rounded-md bg-acento-600 text-xs text-white">CV</span>
          Compras y Ventas
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{lateral}</div>
      </aside>

      {menuMovil && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={() => setMenuMovil(false)}>
          <aside className="h-full w-64 overflow-y-auto bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4 font-semibold">
              Menú
              <button onClick={() => setMenuMovil(false)} aria-label="Cerrar menú">
                <X className="size-5" />
              </button>
            </div>
            {lateral}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-imprimir flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4">
          <button className="lg:hidden" onClick={() => setMenuMovil(true)} aria-label="Abrir menú">
            <Menu className="size-5" />
          </button>

          <label className="relative flex min-w-0 items-center">
            <span className="sr-only">Empresa activa</span>
            <select
              value={empresa?.id ?? ''}
              onChange={(e) => cambiarEmpresa(Number(e.target.value))}
              className="h-9 max-w-[13rem] appearance-none truncate rounded-md border border-slate-200 bg-white pl-3 pr-8 text-sm font-medium sm:max-w-sm"
            >
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre_comercial || e.razon_social} · {e.ruc}
                </option>
              ))}
            </select>
            <ChevronsUpDown className="pointer-events-none absolute right-2 size-4 text-slate-400" />
          </label>
          {empresa?.entorno === 'beta' && <Insignia className="hidden shrink-0 bg-amber-50 text-amber-700 ring-amber-200 sm:inline-flex">Pruebas (beta)</Insignia>}

          <div className="ml-auto flex items-center gap-1">
            <NavLink to="/perfil" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
              <UserRound className="size-4" />
              <span className="hidden sm:inline">{usuario?.nombre_completo}</span>
              {empresa && <span className="hidden text-xs text-slate-400 md:inline">· {empresa.rol.nombre}</span>}
            </NavLink>
            <button onClick={() => salir().then(() => navegar('/login'))} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" title="Cerrar sesión">
              <LogOut className="size-4" />
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
