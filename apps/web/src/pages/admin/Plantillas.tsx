import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, mensajeError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Boton, Campo, Cargando, Encabezado, Entrada, Insignia } from '@/components/ui'
import { MatrizPermisos, type Catalogo } from '@/components/MatrizPermisos'

interface Plantilla {
  id: number
  nombre: string
  descripcion: string | null
  es_sistema: boolean
  permisos: string[]
}

/** Roles base globales que se copian a cada empresa nueva. */
export function Plantillas() {
  const qc = useQueryClient()
  const plantillas = useQuery({ queryKey: ['admin', 'plantillas'], queryFn: () => api.get<Plantilla[]>('/admin/plantillas') })
  const catalogo = useQuery({ queryKey: ['admin', 'permisos'], queryFn: () => api.get<Catalogo>('/admin/permisos'), staleTime: Infinity })
  const [seleccion, setSeleccion] = useState<number | 'nueva' | null>(null)
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [guardando, setGuardando] = useState(false)

  const actual = plantillas.data?.find((p) => p.id === seleccion)
  useEffect(() => {
    if (seleccion === null && plantillas.data?.length) setSeleccion(plantillas.data[0].id)
  }, [plantillas.data, seleccion])
  useEffect(() => {
    if (seleccion === 'nueva') {
      setNombre('')
      setDescripcion('')
      setMarcados(new Set())
    } else if (actual) {
      setNombre(actual.nombre)
      setDescripcion(actual.descripcion ?? '')
      setMarcados(new Set(actual.permisos))
    }
  }, [seleccion, actual])

  const esSistema = Boolean(actual?.es_sistema)
  const total = Object.values(catalogo.data ?? {}).flat().length

  const guardar = async () => {
    setGuardando(true)
    try {
      const cuerpo = { nombre, descripcion: descripcion || null, permisos: [...marcados] }
      if (seleccion === 'nueva') {
        const nueva = await api.post<Plantilla>('/admin/plantillas', cuerpo)
        setSeleccion(nueva.id)
      } else await api.put(`/admin/plantillas/${seleccion}`, cuerpo)
      toast.success('Plantilla guardada. Se aplicará a las empresas que se creen desde ahora.')
      await qc.invalidateQueries({ queryKey: ['admin', 'plantillas'] })
    } catch (e) {
      toast.error(mensajeError(e))
    } finally {
      setGuardando(false)
    }
  }

  const eliminar = async () => {
    if (!actual || !window.confirm(`¿Eliminar la plantilla "${actual.nombre}"? Las empresas existentes conservan su rol.`)) return
    try {
      await api.delete(`/admin/plantillas/${actual.id}`)
      setSeleccion(null)
      await qc.invalidateQueries({ queryKey: ['admin', 'plantillas'] })
    } catch (e) {
      toast.error(mensajeError(e))
    }
  }

  if (plantillas.isLoading || catalogo.isLoading) return <Cargando />

  return (
    <>
      <Encabezado
        titulo="Roles plantilla"
        descripcion="Roles base que se copian a cada empresa nueva, recortados a sus permisos habilitados. Cambiarlos no modifica empresas existentes."
      />
      <div className="grid gap-5 lg:grid-cols-[16rem_1fr]">
        <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-2">
          {plantillas.data?.map((p) => (
            <button
              key={p.id}
              onClick={() => setSeleccion(p.id)}
              className={cn('flex items-center gap-1.5 rounded-md px-3 py-2 text-left text-sm', seleccion === p.id ? 'bg-acento-50 font-medium text-acento-700' : 'hover:bg-slate-50')}
            >
              {p.es_sistema && <Lock className="size-3.5 text-slate-400" />}
              {p.nombre}
            </button>
          ))}
          <Boton variante="fantasma" tamano="sm" className="mt-1 justify-start" onClick={() => setSeleccion('nueva')}><Plus className="size-3.5" /> Nueva plantilla</Boton>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="grid gap-4 border-b border-slate-100 p-5 sm:grid-cols-2">
            <Campo etiqueta="Nombre"><Entrada value={nombre} disabled={esSistema} onChange={(e) => setNombre(e.target.value)} /></Campo>
            <Campo etiqueta="Descripción"><Entrada value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></Campo>
            {esSistema && <p className="text-sm text-slate-500 sm:col-span-2">El Administrador recibe siempre todos los permisos habilitados de su empresa.</p>}
          </div>
          {!esSistema && <MatrizPermisos catalogo={catalogo.data ?? {}} marcados={marcados} onCambio={setMarcados} />}
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 p-4">
            <Boton onClick={guardar} cargando={guardando} disabled={!nombre.trim()}><Save className="size-4" /> Guardar</Boton>
            {actual && !actual.es_sistema && <Boton variante="fantasma" className="text-rose-600" onClick={eliminar}><Trash2 className="size-4" /> Eliminar</Boton>}
            {!esSistema && <Insignia className="ml-auto bg-slate-100 text-slate-600 ring-slate-200">{marcados.size} de {total} permisos</Insignia>}
          </div>
        </div>
      </div>
    </>
  )
}
