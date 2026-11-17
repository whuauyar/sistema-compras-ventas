import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Building2, LogOut, ShieldCheck } from 'lucide-react'
import { useSesion } from '@/lib/sesion'
import { cn } from '@/lib/utils'
import { Insignia } from '@/components/ui'

const ENLACES = [
  { a: '/admin', texto: 'Empresas', icono: Building2, fin: false },
  { a: '/admin/plantillas', texto: 'Roles plantilla', icono: ShieldCheck, fin: true },
]

/** Consola del SuperAdmin de la plataforma. */
export function AdminLayout() {
  const { usuario, salir } = useSesion()
  const navegar = useNavigate()
  const { pathname } = useLocation()
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4">
        <span className="grid size-7 place-items-center rounded-md bg-slate-900 text-xs text-white">CV</span>
        <span className="hidden font-semibold sm:inline">Plataforma</span>
        <Insignia className="bg-slate-900 text-white ring-slate-900">SuperAdmin</Insignia>
        <nav className="ml-2 flex gap-1">
          {ENLACES.map((e) => (
            <NavLink
              key={e.a}
              to={e.a}
              end={e.fin}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100',
                  isActive && !(e.a === '/admin' && pathname.startsWith('/admin/plantillas')) && 'bg-acento-50 font-medium text-acento-700'
                )
              }
            >
              <e.icono className="size-4" />
              <span className="hidden sm:inline">{e.texto}</span>
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <span className="hidden text-sm text-slate-600 md:inline">{usuario?.nombre_completo}</span>
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
  )
}
