import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { api, mensajeError } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { FORMATOS } from '@/lib/sunat'
import { Boton, Campo, Cargando, Dialogo, Encabezado, Entrada, Insignia, Selector, Tabla } from '@/components/ui'
import { SelectorUbigeo } from '@/components/SelectorUbigeo'

export interface SucursalFila {
  id: number
  nombre: string
  cod_local: string
  direccion: string
  ubigeo: string
  es_principal: boolean
  formato_impresion: string | null
  activo: boolean
  sunat_sucursal_id: number | null
}

export function Sucursales() {
  const { puede } = useSesion()
  const qc = useQueryClient()
  const [abierto, setAbierto] = useState(false)
  const [editando, setEditando] = useState<SucursalFila | null>(null)
  const { data, isLoading } = useQuery({ queryKey: ['sucursales'], queryFn: () => api.get<SucursalFila[]>('/sucursales') })
  const { register, handleSubmit, reset, watch, setValue, formState } = useForm<Omit<SucursalFila, 'id'>>()
  const editable = puede('config.sucursales')

  const abrir = (s: SucursalFila | null) => {
    setEditando(s)
    reset(s ?? { nombre: '', cod_local: '', direccion: '', ubigeo: '', formato_impresion: '', activo: true })
    setAbierto(true)
  }

  const guardar = handleSubmit(async (d) => {
    if (!/^\d{6}$/.test(d.ubigeo ?? '')) {
      toast.error('Seleccione el distrito.')
      return
    }
    const cuerpo = { nombre: d.nombre, cod_local: d.cod_local, direccion: d.direccion, ubigeo: d.ubigeo, formato_impresion: d.formato_impresion || null }
    try {
      if (editando) {
        await api.put(`/sucursales/${editando.id}`, { ...cuerpo, activo: d.activo })
        toast.success('Sucursal actualizada en SUNAT.')
      } else {
        await api.post('/sucursales', cuerpo)
        toast.success('Sucursal creada con su almacén y caja.')
      }
      setAbierto(false)
      qc.invalidateQueries({ queryKey: ['sucursales'] })
    } catch (e) {
      toast.error(mensajeError(e))
    }
  })

  return (
    <>
      <Encabezado
        titulo="Sucursales"
        descripcion="Cada sucursal se registra también en SUNAT (código de local)."
        acciones={editable && <Boton onClick={() => abrir(null)}><Plus className="size-4" /> Nueva sucursal</Boton>}
      />
      {isLoading ? <Cargando /> : (
        <Tabla>
          <thead><tr><th>Cód.</th><th>Nombre</th><th className="hidden md:table-cell">Dirección</th><th>Impresión</th><th>SUNAT</th>{editable && <th />}</tr></thead>
          <tbody>
            {data?.map((s) => (
              <tr key={s.id} className={s.activo ? '' : 'opacity-50'}>
                <td className="font-mono">{s.cod_local}</td>
                <td>{s.nombre} {s.es_principal && <Insignia className="ml-1 bg-acento-50 text-acento-700 ring-acento-100">Principal</Insignia>}</td>
                <td className="hidden md:table-cell">{s.direccion}</td>
                <td>{FORMATOS.find((f) => f.valor === s.formato_impresion)?.etiqueta ?? 'De la empresa'}</td>
                <td>{s.sunat_sucursal_id ? 'Sincronizada' : <span className="text-amber-700">Sin sincronizar</span>}</td>
                {editable && <td className="text-right"><Boton variante="fantasma" tamano="sm" onClick={() => abrir(s)} title="Editar"><Pencil className="size-3.5" /></Boton></td>}
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
      <Dialogo abierto={abierto} titulo={editando ? `Editar ${editando.nombre}` : 'Nueva sucursal'} onCerrar={() => setAbierto(false)} ancho="max-w-2xl">
        <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Nombre"><Entrada {...register('nombre', { required: true })} /></Campo>
          <Campo etiqueta="Código de local" ayuda="4 dígitos SUNAT (ej. 0001)"><Entrada maxLength={4} inputMode="numeric" readOnly={Boolean(editando)} className={editando ? "bg-slate-50" : undefined} {...register('cod_local', { required: true, pattern: /^\d{4}$/ })} /></Campo>
          <Campo etiqueta="Dirección" className="sm:col-span-2"><Entrada {...register('direccion', { required: true })} /></Campo>
          <SelectorUbigeo valor={watch('ubigeo')} onCambio={(u) => setValue('ubigeo', u.ubigeo)} />
          <Campo etiqueta="Formato de impresión">
            <Selector {...register('formato_impresion')}><option value="">De la empresa</option>{FORMATOS.map((f) => <option key={f.valor} value={f.valor}>{f.etiqueta}</option>)}</Selector>
          </Campo>
          {editando && (
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" className="size-4 accent-acento-600" {...register('activo')} /> Activa
            </label>
          )}
          <Boton type="submit" cargando={formState.isSubmitting} className="sm:col-span-2 sm:justify-self-start">{editando ? 'Guardar cambios' : 'Crear sucursal'}</Boton>
        </form>
      </Dialogo>
    </>
  )
}
