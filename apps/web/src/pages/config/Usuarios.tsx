import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { api, mensajeError } from '@/lib/api'
import { fecha } from '@/lib/utils'
import { Boton, Campo, Cargando, Dialogo, Encabezado, Entrada, Insignia, Selector, Tabla } from '@/components/ui'
import type { SucursalFila } from './Sucursales'

interface MiembroFila {
  membresia_id: number
  nombre_completo: string
  email: string
  rol: { id: number; nombre: string }
  activo: boolean
  sucursal_ids: number[]
  ultimo_acceso_en: string | null
}

export function Usuarios() {
  const qc = useQueryClient()
  const [abierto, setAbierto] = useState(false)
  const usuarios = useQuery({ queryKey: ['usuarios'], queryFn: () => api.get<MiembroFila[]>('/usuarios') })
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api.get<Array<{ id: number; nombre: string }>>('/roles') })
  const sucursales = useQuery({ queryKey: ['sucursales'], queryFn: () => api.get<SucursalFila[]>('/sucursales') })
  const { register, handleSubmit, reset, formState } = useForm<{ nombre_completo: string; email: string; password: string; rol_id: string; sucursal_ids: string[] }>()

  const refrescar = () => qc.invalidateQueries({ queryKey: ['usuarios'] })
  const actualizar = async (id: number, cambios: Record<string, unknown>) => {
    try {
      await api.put(`/usuarios/${id}`, cambios)
      toast.success('Usuario actualizado.')
      refrescar()
    } catch (e) {
      toast.error(mensajeError(e))
    }
  }
  const crear = handleSubmit(async (d) => {
    try {
      await api.post('/usuarios', {
        nombre_completo: d.nombre_completo,
        email: d.email,
        password: d.password || undefined,
        rol_id: Number(d.rol_id),
        sucursal_ids: (d.sucursal_ids || []).map(Number),
      })
      toast.success('Usuario agregado.')
      setAbierto(false)
      reset()
      refrescar()
    } catch (e) {
      toast.error(mensajeError(e))
    }
  })

  return (
    <>
      <Encabezado titulo="Usuarios" descripcion="Personas con acceso a esta empresa y su rol." acciones={<Boton onClick={() => setAbierto(true)}><Plus className="size-4" /> Agregar usuario</Boton>} />
      {usuarios.isLoading ? <Cargando /> : (
        <Tabla>
          <thead><tr><th>Usuario</th><th>Rol</th><th className="hidden md:table-cell">Sucursales</th><th className="hidden md:table-cell">Último acceso</th><th>Estado</th></tr></thead>
          <tbody>
            {usuarios.data?.map((u) => (
              <tr key={u.membresia_id}>
                <td>
                  <div className="flex items-center gap-2">
                    <UserRound className="size-4 text-slate-400" />
                    <div><p className="font-medium">{u.nombre_completo}</p><p className="text-xs text-slate-500">{u.email}</p></div>
                  </div>
                </td>
                <td>
                  <Selector className="h-8 w-40" value={u.rol.id} onChange={(e) => actualizar(u.membresia_id, { rol_id: Number(e.target.value) })}>
                    {roles.data?.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                  </Selector>
                </td>
                <td className="hidden md:table-cell">
                  {u.sucursal_ids.length === 0 ? <span className="text-slate-500">Todas</span> : u.sucursal_ids.map((id) => sucursales.data?.find((s) => s.id === id)?.nombre).join(', ')}
                </td>
                <td className="hidden md:table-cell">{fecha(u.ultimo_acceso_en)}</td>
                <td>
                  <button onClick={() => actualizar(u.membresia_id, { activo: !u.activo })} title={u.activo ? 'Desactivar' : 'Activar'}>
                    {u.activo ? <Insignia className="bg-emerald-50 text-emerald-700 ring-emerald-200">Activo</Insignia> : <Insignia className="bg-slate-100 text-slate-500 ring-slate-200">Inactivo</Insignia>}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
      <Dialogo abierto={abierto} titulo="Agregar usuario" onCerrar={() => setAbierto(false)}>
        <form onSubmit={crear} className="flex flex-col gap-4">
          <Campo etiqueta="Nombre completo"><Entrada {...register('nombre_completo', { required: true })} /></Campo>
          <Campo etiqueta="Correo" ayuda="Si ya tiene cuenta, solo se le da acceso a esta empresa."><Entrada type="email" {...register('email', { required: true })} /></Campo>
          <Campo etiqueta="Contraseña inicial" ayuda="Solo para usuarios nuevos (mín. 8)."><Entrada type="password" autoComplete="new-password" {...register('password')} /></Campo>
          <Campo etiqueta="Rol"><Selector {...register('rol_id', { required: true })}>{roles.data?.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}</Selector></Campo>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-sm font-medium text-slate-700">Sucursales (vacío = todas)</legend>
            {sucursales.data?.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm"><input type="checkbox" value={s.id} className="size-4 accent-acento-600" {...register('sucursal_ids')} /> {s.nombre}</label>
            ))}
          </fieldset>
          <Boton type="submit" cargando={formState.isSubmitting} className="self-start">Agregar</Boton>
        </form>
      </Dialogo>
    </>
  )
}
