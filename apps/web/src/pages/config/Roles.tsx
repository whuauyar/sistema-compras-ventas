import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Lock, Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, mensajeError } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { Boton, Campo, Cargando, Encabezado, Entrada, Insignia } from '@/components/ui'
import { cn } from '@/lib/utils'
import { MatrizPermisos, type Catalogo } from '@/components/MatrizPermisos'

interface RolFila {
  id: number
  nombre: string
  descripcion: string | null
  es_sistema: boolean
  permisos: string[]
  usuarios: number
}

/** Configurador de Rol: matriz de permisos por módulo. */
export function Roles() {
  const { recargar } = useSesion()
  const qc = useQueryClient()
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api.get<RolFila[]>('/roles') })
  const catalogo = useQuery({ queryKey: ['permisos'], queryFn: () => api.get<Catalogo>('/permisos'), staleTime: Infinity })
  const [seleccion, setSeleccion] = useState<number | 'nuevo' | null>(null)
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [guardando, setGuardando] = useState(false)

  const rol = roles.data?.find((r) => r.id === seleccion)
  useEffect(() => {
    if (seleccion === null && roles.data?.length) setSeleccion(roles.data[0].id)
  }, [roles.data, seleccion])
  useEffect(() => {
    if (seleccion === 'nuevo') {
      setNombre('')
      setDescripcion('')
      setMarcados(new Set())
    } else if (rol) {
      setNombre(rol.nombre)
      setDescripcion(rol.descripcion ?? '')
      setMarcados(new Set(rol.permisos))
    }
  }, [seleccion, rol])

  const todos = useMemo(() => Object.values(catalogo.data ?? {}).flat().map((p) => p.codigo), [catalogo.data])
  const bloqueado = Boolean(rol?.es_sistema)
  const refrescar = async () => {
    await qc.invalidateQueries({ queryKey: ['roles'] })
    await recargar() // por si cambiaron los permisos del propio usuario
  }

  const guardar = async () => {
    setGuardando(true)
    try {
      const cuerpo = { nombre, descripcion: descripcion || null, permisos: [...marcados] }
      if (seleccion === 'nuevo') {
        const nuevo = await api.post<RolFila>('/roles', cuerpo)
        setSeleccion(nuevo.id)
      } else await api.put(`/roles/${seleccion}`, cuerpo)
      toast.success('Rol guardado.')
      await refrescar()
    } catch (e) {
      toast.error(mensajeError(e))
    } finally {
      setGuardando(false)
    }
  }

  const clonar = async () => {
    try {
      const copia = await api.post<RolFila>(`/roles/${seleccion}/clonar`)
      await refrescar()
      setSeleccion(copia.id)
    } catch (e) {
      toast.error(mensajeError(e))
    }
  }

  const eliminar = async () => {
    if (!rol || !window.confirm(`¿Eliminar el rol "${rol.nombre}"?`)) return
    try {
      await api.delete(`/roles/${rol.id}`)
      setSeleccion(null)
      await refrescar()
    } catch (e) {
      toast.error(mensajeError(e))
    }
  }

  if (roles.isLoading || catalogo.isLoading) return <Cargando />

  return (
    <>
      <Encabezado titulo="Roles y permisos" descripcion="Defina qué puede hacer cada rol en esta empresa. Solo aparecen los permisos que la plataforma habilitó para ella." />
      <div className="grid gap-5 lg:grid-cols-[16rem_1fr]">
        <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-2">
          {roles.data?.map((r) => (
            <button key={r.id} onClick={() => setSeleccion(r.id)} className={cn('flex items-center justify-between rounded-md px-3 py-2 text-left text-sm', seleccion === r.id ? 'bg-acento-50 font-medium text-acento-700' : 'hover:bg-slate-50')}>
              <span className="flex items-center gap-1.5">{r.es_sistema && <Lock className="size-3.5 text-slate-400" />}{r.nombre}</span>
              <span className="text-xs text-slate-400">{r.usuarios}</span>
            </button>
          ))}
          <Boton variante="fantasma" tamano="sm" className="mt-1 justify-start" onClick={() => setSeleccion('nuevo')}><Plus className="size-3.5" /> Nuevo rol</Boton>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="grid gap-4 border-b border-slate-100 p-5 sm:grid-cols-2">
            <Campo etiqueta="Nombre"><Entrada value={nombre} disabled={bloqueado} onChange={(e) => setNombre(e.target.value)} /></Campo>
            <Campo etiqueta="Descripción"><Entrada value={descripcion} disabled={bloqueado} onChange={(e) => setDescripcion(e.target.value)} /></Campo>
            {bloqueado && <p className="text-sm text-slate-500 sm:col-span-2">El rol Administrador siempre tiene todos los permisos que la plataforma habilitó para su empresa.</p>}
          </div>
          <MatrizPermisos catalogo={catalogo.data ?? {}} marcados={marcados} onCambio={setMarcados} bloqueado={bloqueado} />
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 p-4">
            <Boton onClick={guardar} cargando={guardando} disabled={bloqueado || !nombre.trim()}><Save className="size-4" /> Guardar</Boton>
            {typeof seleccion === 'number' && <Boton variante="secundario" onClick={clonar}><Copy className="size-4" /> Clonar</Boton>}
            {rol && !rol.es_sistema && <Boton variante="fantasma" className="text-rose-600" onClick={eliminar}><Trash2 className="size-4" /> Eliminar</Boton>}
            <Insignia className="ml-auto bg-slate-100 text-slate-600 ring-slate-200">{marcados.size} de {todos.length} permisos</Insignia>
          </div>
        </div>
      </div>
    </>
  )
}
