import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { api, mensajeError } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { TIPOS_DOCUMENTO } from '@/lib/sunat'
import { Boton, Campo, Cargando, Dialogo, Encabezado, Entrada, Selector, Tabla } from '@/components/ui'
import type { SucursalFila } from './Sucursales'

interface SerieFila {
  id: number
  tipo_documento: string
  serie: string
  sucursal_id: number | null
  sunat_serie_id: number | null
  activo: boolean
}

const AYUDA_PREFIJO: Record<string, string> = { '01': 'F###', '03': 'B###', '07': 'F o B (ej. FC01)', '08': 'F o B (ej. FD01)', '09': 'T###', '31': 'V###' }

export function Series() {
  const { puede } = useSesion()
  const qc = useQueryClient()
  const [abierto, setAbierto] = useState(false)
  const series = useQuery({ queryKey: ['series'], queryFn: () => api.get<SerieFila[]>('/series') })
  const sucursales = useQuery({ queryKey: ['sucursales'], queryFn: () => api.get<SucursalFila[]>('/sucursales') })
  const { register, handleSubmit, watch, reset, formState } = useForm<{ tipo_documento: string; serie: string; sucursal_id: string; correlativo_inicial: number }>({
    defaultValues: { tipo_documento: '01', correlativo_inicial: 0 },
  })
  const nombreSucursal = (id: number | null) => sucursales.data?.find((s) => s.id === id)?.nombre ?? '—'

  const crear = handleSubmit(async (d) => {
    try {
      await api.post('/series', { ...d, sucursal_id: Number(d.sucursal_id), correlativo_inicial: Number(d.correlativo_inicial) })
      toast.success('Serie creada.')
      setAbierto(false)
      reset()
      qc.invalidateQueries({ queryKey: ['series'] })
    } catch (e) {
      toast.error(mensajeError(e))
    }
  })

  const alternar = async (s: SerieFila) => {
    if (s.activo && !window.confirm(`¿Desactivar la serie ${s.serie}? No se podrá emitir con ella.`)) return
    try {
      await api.put(`/series/${s.id}`, { activo: !s.activo })
      qc.invalidateQueries({ queryKey: ['series'] })
    } catch (e) {
      toast.error(mensajeError(e))
    }
  }

  return (
    <>
      <Encabezado
        titulo="Series"
        descripcion="Series de comprobantes por sucursal."
        acciones={puede('config.series') && <Boton onClick={() => setAbierto(true)}><Plus className="size-4" /> Nueva serie</Boton>}
      />
      {series.isLoading ? <Cargando /> : (
        <Tabla>
          <thead><tr><th>Serie</th><th>Documento</th><th>Sucursal</th><th>SUNAT</th><th>Estado</th></tr></thead>
          <tbody>
            {series.data?.map((s) => (
              <tr key={s.id}>
                <td className="font-mono font-medium">{s.serie}</td>
                <td>{TIPOS_DOCUMENTO[s.tipo_documento]}</td>
                <td>{nombreSucursal(s.sucursal_id)}</td>
                <td>{s.sunat_serie_id ? 'Registrada' : <span className="text-slate-500">Existente / sin id</span>}</td>
                <td>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4 accent-acento-600" checked={s.activo} disabled={!puede('config.series')} onChange={() => alternar(s)} />
                    {s.activo ? 'Activa' : 'Inactiva'}
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
      <Dialogo abierto={abierto} titulo="Nueva serie" onCerrar={() => setAbierto(false)}>
        <form onSubmit={crear} className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Documento">
            <Selector {...register('tipo_documento')}>{Object.entries(TIPOS_DOCUMENTO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</Selector>
          </Campo>
          <Campo etiqueta="Serie" ayuda={`Formato: ${AYUDA_PREFIJO[watch('tipo_documento')]}`}>
            <Entrada maxLength={4} className="uppercase" {...register('serie', { required: true })} />
          </Campo>
          <Campo etiqueta="Sucursal">
            <Selector {...register('sucursal_id', { required: true })}>{sucursales.data?.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Selector>
          </Campo>
          <Campo etiqueta="Último correlativo usado" ayuda="0 si es nueva"><Entrada type="number" min={0} {...register('correlativo_inicial')} /></Campo>
          <Boton type="submit" cargando={formState.isSubmitting} className="sm:col-span-2 sm:justify-self-start">Crear serie</Boton>
        </form>
      </Dialogo>
    </>
  )
}
