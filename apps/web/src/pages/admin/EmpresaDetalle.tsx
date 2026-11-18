import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Save, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { api, mensajeError } from '@/lib/api'
import { fecha } from '@/lib/utils'
import { Boton, Campo, Cargando, Dialogo, Encabezado, Entrada, Insignia, Selector, Tabla, Tarjeta } from '@/components/ui'
import { MatrizPermisos, type Catalogo } from '@/components/MatrizPermisos'
import { EstadoEmpresa } from './Empresas'

interface DetalleEmpresa {
  empresa: {
    id: number
    ruc: string
    razon_social: string
    nombre_comercial: string | null
    entorno: 'beta' | 'production'
    activo: boolean
    sunat_api_key: string
  }
  permisos: string[]
  roles: Array<{ id: number; nombre: string; es_sistema: boolean }>
  sucursales: Array<{ id: number; nombre: string; cod_local: string }>
}

interface MiembroFila {
  membresia_id: number
  nombre_completo: string
  email: string
  rol: { id: number; nombre: string }
  activo: boolean
  sucursal_ids: number[]
  ultimo_acceso_en: string | null
}

/** Una empresa vista por el SuperAdmin: estado, tope de permisos y usuarios. */
export function EmpresaDetalle() {
  const { id } = useParams()
  const qc = useQueryClient()
  const detalle = useQuery({ queryKey: ['admin', 'empresa', id], queryFn: () => api.get<DetalleEmpresa>(`/admin/empresas/${id}`) })
  const catalogo = useQuery({ queryKey: ['admin', 'permisos'], queryFn: () => api.get<Catalogo>('/admin/permisos'), staleTime: Infinity })
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (detalle.data) setMarcados(new Set(detalle.data.permisos))
  }, [detalle.data])

  if (detalle.isLoading || catalogo.isLoading || !detalle.data) return <Cargando />
  const { empresa } = detalle.data
  const total = Object.values(catalogo.data ?? {}).flat().length
  const cambios = marcados.size !== detalle.data.permisos.length || detalle.data.permisos.some((p) => !marcados.has(p))

  const guardarPermisos = async () => {
    const quitados = detalle.data!.permisos.filter((p) => !marcados.has(p))
    if (quitados.length && !window.confirm(`Se quitarán ${quitados.length} permiso(s) a todos los roles de la empresa. ¿Continuar?`)) return
    setGuardando(true)
    try {
      await api.put(`/admin/empresas/${empresa.id}/permisos`, { permisos: [...marcados] })
      toast.success('Permisos de la empresa actualizados.')
      qc.invalidateQueries({ queryKey: ['admin'] })
    } catch (e) {
      toast.error(mensajeError(e))
    } finally {
      setGuardando(false)
    }
  }

  const cambiarEstado = async () => {
    if (empresa.activo && !window.confirm('¿Suspender la empresa? Sus usuarios no podrán ingresar a ella.')) return
    try {
      await api.put(`/admin/empresas/${empresa.id}/estado`, { activo: !empresa.activo })
      qc.invalidateQueries({ queryKey: ['admin'] })
    } catch (e) {
      toast.error(mensajeError(e))
    }
  }

  return (
    <>
      <Encabezado
        titulo={empresa.nombre_comercial || empresa.razon_social}
        descripcion={`RUC ${empresa.ruc} · ${empresa.entorno === 'beta' ? 'Pruebas (beta)' : 'Producción'} · API key ${empresa.sunat_api_key}`}
        acciones={
          <div className="flex items-center gap-2">
            <EstadoEmpresa activo={empresa.activo} />
            <Boton variante="secundario" className={empresa.activo ? 'text-rose-600' : ''} onClick={cambiarEstado}>
              {empresa.activo ? 'Suspender' : 'Reactivar'}
            </Boton>
          </div>
        }
      />

      <Tarjeta
        titulo="Permisos habilitados"
        descripcion="Tope de lo que esta empresa puede usar. Sus roles no pueden superar esta lista; lo que quite aquí se retira de todos sus roles."
        className="mb-5"
      >
        <div className="-mx-5 -mt-5 border-b border-slate-100">
          <MatrizPermisos catalogo={catalogo.data ?? {}} marcados={marcados} onCambio={setMarcados} />
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Boton onClick={guardarPermisos} cargando={guardando} disabled={!cambios}><Save className="size-4" /> Guardar permisos</Boton>
          <Insignia className="ml-auto bg-slate-100 text-slate-600 ring-slate-200">{marcados.size} de {total} permisos</Insignia>
        </div>
      </Tarjeta>

      <UsuariosEmpresa empresaId={empresa.id} roles={detalle.data.roles} sucursales={detalle.data.sucursales ?? []} />
    </>
  )
}

function UsuariosEmpresa({ empresaId, roles, sucursales }: { empresaId: number; roles: DetalleEmpresa['roles']; sucursales: DetalleEmpresa['sucursales'] }) {
  const qc = useQueryClient()
  const [abierto, setAbierto] = useState(false)
  const [editando, setEditando] = useState<MiembroFila | null>(null)
  const clave = ['admin', 'empresa', String(empresaId), 'usuarios']
  const usuarios = useQuery({ queryKey: clave, queryFn: () => api.get<MiembroFila[]>(`/admin/empresas/${empresaId}/usuarios`) })
  const { register, handleSubmit, reset, formState } = useForm<{ nombre_completo: string; email: string; password: string; rol_id: string }>()

  const refrescar = () => qc.invalidateQueries({ queryKey: ['admin'] })
  const actualizar = async (membresiaId: number, cambios: Record<string, unknown>) => {
    try {
      await api.put(`/admin/empresas/${empresaId}/usuarios/${membresiaId}`, cambios)
      toast.success('Usuario actualizado.')
      refrescar()
    } catch (e) {
      toast.error(mensajeError(e))
    }
  }
  const crear = handleSubmit(async (d) => {
    try {
      await api.post(`/admin/empresas/${empresaId}/usuarios`, {
        nombre_completo: d.nombre_completo,
        email: d.email,
        password: d.password || undefined,
        rol_id: Number(d.rol_id),
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
    <Tarjeta
      titulo="Usuarios"
      descripcion="Personas con acceso a esta empresa y su rol."
      acciones={<Boton tamano="sm" onClick={() => setAbierto(true)}><Plus className="size-3.5" /> Agregar usuario</Boton>}
    >
      {usuarios.isLoading ? (
        <Cargando />
      ) : (
        <div>
          <Tabla>
            <thead><tr><th>Usuario</th><th>Rol</th><th className="hidden md:table-cell">Último acceso</th><th>Estado</th><th /></tr></thead>
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
                      {roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                    </Selector>
                  </td>
                  <td className="hidden md:table-cell">{fecha(u.ultimo_acceso_en)}</td>
                  <td>
                    <button onClick={() => actualizar(u.membresia_id, { activo: !u.activo })} title={u.activo ? 'Desactivar' : 'Activar'}>
                      {u.activo ? <Insignia className="bg-emerald-50 text-emerald-700 ring-emerald-200">Activo</Insignia> : <Insignia className="bg-slate-100 text-slate-500 ring-slate-200">Inactivo</Insignia>}
                    </button>
                  </td>
                  <td className="text-right">
                    <Boton variante="fantasma" tamano="sm" title="Editar usuario" onClick={() => setEditando(u)}><Pencil className="size-3.5" /></Boton>
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </div>
      )}
      {editando && (
        <EditarUsuario
          empresaId={empresaId}
          miembro={editando}
          roles={roles}
          sucursales={sucursales}
          onCerrar={() => setEditando(null)}
          onGuardado={() => { setEditando(null); refrescar() }}
        />
      )}
      <Dialogo abierto={abierto} titulo="Agregar usuario" onCerrar={() => setAbierto(false)}>
        <form onSubmit={crear} className="flex flex-col gap-4">
          <Campo etiqueta="Nombre completo"><Entrada {...register('nombre_completo', { required: true })} /></Campo>
          <Campo etiqueta="Correo" ayuda="Si ya tiene cuenta, solo se le da acceso a esta empresa."><Entrada type="email" {...register('email', { required: true })} /></Campo>
          <Campo etiqueta="Contraseña inicial" ayuda="Solo para usuarios nuevos (mín. 8)."><Entrada type="password" autoComplete="new-password" {...register('password')} /></Campo>
          <Campo etiqueta="Rol"><Selector {...register('rol_id', { required: true })}>{roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}</Selector></Campo>
          <Boton type="submit" cargando={formState.isSubmitting} className="self-start">Agregar</Boton>
        </form>
      </Dialogo>
    </Tarjeta>
  )
}

function EditarUsuario({
  empresaId,
  miembro,
  roles,
  sucursales,
  onCerrar,
  onGuardado,
}: {
  empresaId: number
  miembro: MiembroFila
  roles: DetalleEmpresa['roles']
  sucursales: DetalleEmpresa['sucursales']
  onCerrar: () => void
  onGuardado: () => void
}) {
  const { register, handleSubmit, formState } = useForm({
    defaultValues: {
      nombre_completo: miembro.nombre_completo,
      email: miembro.email,
      password: '',
      rol_id: String(miembro.rol.id),
      activo: miembro.activo,
      sucursal_ids: (miembro.sucursal_ids ?? []).map(String),
    },
  })
  const guardar = handleSubmit(async (d) => {
    const cuerpo: Record<string, unknown> = {}
    if (d.nombre_completo !== miembro.nombre_completo) cuerpo.nombre_completo = d.nombre_completo
    if (d.email.trim().toLowerCase() !== miembro.email) cuerpo.email = d.email
    if (d.password) cuerpo.password = d.password
    if (Number(d.rol_id) !== miembro.rol.id) cuerpo.rol_id = Number(d.rol_id)
    if (d.activo !== miembro.activo) cuerpo.activo = d.activo
    cuerpo.sucursal_ids = (d.sucursal_ids || []).map(Number)
    try {
      await api.put(`/admin/empresas/${empresaId}/usuarios/${miembro.membresia_id}`, cuerpo)
      toast.success(d.password ? 'Usuario actualizado. Sus sesiones abiertas se cerraron.' : 'Usuario actualizado.')
      onGuardado()
    } catch (e) {
      toast.error(mensajeError(e))
    }
  })
  return (
    <Dialogo abierto titulo={`Editar ${miembro.nombre_completo}`} onCerrar={onCerrar}>
      <form onSubmit={guardar} className="flex flex-col gap-4">
        <Campo etiqueta="Nombre completo"><Entrada {...register('nombre_completo', { required: true, minLength: 3 })} /></Campo>
        <Campo etiqueta="Correo" ayuda="Es su usuario para ingresar. Si tiene acceso a otras empresas, el cambio también aplica ahí.">
          <Entrada type="email" {...register('email', { required: true })} />
        </Campo>
        <Campo etiqueta="Nueva contraseña" ayuda="Déjela vacía para no cambiarla. Mínimo 8 caracteres; cierra sus sesiones abiertas.">
          <Entrada type="password" autoComplete="new-password" {...register('password', { minLength: 8 })} />
        </Campo>
        <Campo etiqueta="Rol"><Selector {...register('rol_id')}>{roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}</Selector></Campo>
        {sucursales.length > 0 && (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Sucursales</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5">
              {sucursales.map((s) => (
                <label key={s.id} className="flex items-center gap-1.5 text-sm text-slate-600">
                  <input type="checkbox" className="size-4 accent-acento-600" value={String(s.id)} {...register('sucursal_ids')} />
                  {s.nombre} <span className="text-xs text-slate-400">{s.cod_local}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-acento-600" {...register('activo')} /> Acceso activo a esta empresa
        </label>
        <Boton type="submit" cargando={formState.isSubmitting} className="self-start">Guardar cambios</Boton>
      </form>
    </Dialogo>
  )
}
