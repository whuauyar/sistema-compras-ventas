import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Building2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { api, mensajeError } from '@/lib/api'
import { fecha } from '@/lib/utils'
import { Boton, Cargando, Encabezado, Insignia, Tabla, Vacio } from '@/components/ui'

export interface EmpresaAdminFila {
  id: number
  ruc: string
  razon_social: string
  nombre_comercial: string | null
  entorno: 'beta' | 'production'
  activo: boolean
  usuarios: number
  permisos_habilitados: number
  created_at: string
}

export function EstadoEmpresa({ activo }: { activo: boolean }) {
  return activo ? (
    <Insignia className="bg-emerald-50 text-emerald-700 ring-emerald-200">Activa</Insignia>
  ) : (
    <Insignia className="bg-rose-50 text-rose-700 ring-rose-200">Suspendida</Insignia>
  )
}

/** Listado de empresas de la plataforma. */
export function EmpresasAdmin() {
  const qc = useQueryClient()
  const navegar = useNavigate()
  const empresas = useQuery({ queryKey: ['admin', 'empresas'], queryFn: () => api.get<EmpresaAdminFila[]>('/admin/empresas') })

  const cambiarEstado = async (e: EmpresaAdminFila) => {
    const accion = e.activo ? 'suspender' : 'reactivar'
    if (!window.confirm(`¿${accion[0].toUpperCase() + accion.slice(1)} ${e.razon_social}?${e.activo ? ' Sus usuarios no podrán ingresar a ella.' : ''}`)) return
    try {
      await api.put(`/admin/empresas/${e.id}/estado`, { activo: !e.activo })
      toast.success(e.activo ? 'Empresa suspendida.' : 'Empresa reactivada.')
      qc.invalidateQueries({ queryKey: ['admin'] })
    } catch (err) {
      toast.error(mensajeError(err))
    }
  }

  return (
    <>
      <Encabezado
        titulo="Empresas"
        descripcion="Alta de empresas, permisos habilitados y usuarios."
        acciones={<Boton onClick={() => navegar('/admin/empresas/nueva')}><Plus className="size-4" /> Nueva empresa</Boton>}
      />
      {empresas.isLoading ? (
        <Cargando />
      ) : !empresas.data?.length ? (
        <Vacio icono={<Building2 className="size-8" />} titulo="Aún no hay empresas" texto="Dé de alta la primera empresa y su Administrador." />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Empresa</th>
              <th>RUC</th>
              <th>Entorno</th>
              <th className="text-right">Usuarios</th>
              <th className="text-right">Permisos</th>
              <th>Estado</th>
              <th>Alta</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {empresas.data.map((e) => (
              <tr key={e.id}>
                <td>
                  <Link to={`/admin/empresas/${e.id}`} className="font-medium text-acento-700 hover:underline">{e.nombre_comercial || e.razon_social}</Link>
                  {e.nombre_comercial && <p className="text-xs text-slate-500">{e.razon_social}</p>}
                </td>
                <td className="tabular-nums">{e.ruc}</td>
                <td>{e.entorno === 'beta' ? 'Pruebas' : 'Producción'}</td>
                <td className="text-right tabular-nums">{e.usuarios}</td>
                <td className="text-right tabular-nums">{e.permisos_habilitados}</td>
                <td><EstadoEmpresa activo={e.activo} /></td>
                <td>{fecha(e.created_at)}</td>
                <td className="text-right">
                  <Boton variante="fantasma" tamano="sm" className={e.activo ? 'text-rose-600' : ''} onClick={() => cambiarEstado(e)}>
                    {e.activo ? 'Suspender' : 'Reactivar'}
                  </Boton>
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  )
}
