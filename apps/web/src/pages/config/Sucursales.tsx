import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { api, mensajeError } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { FORMATOS } from '@/lib/sunat'
import { Boton, Campo, Cargando, Dialogo, Encabezado, Entrada, Insignia, Selector, Tabla } from '@/components/ui'

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
  const { data, isLoading } = useQuery({ queryKey: ['sucursales'], queryFn: () => api.get<SucursalFila[]>('/sucursales') })
  const { register, handleSubmit, reset, formState } = useForm<Omit<SucursalFila, 'id'>>()

  const crear = handleSubmit(async (d) => {
    try {
      await api.post('/sucursales', { ...d, formato_impresion: d.formato_impresion || null })
      toast.success('Sucursal creada con su almacén y caja.')
      setAbierto(false)
      reset()
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
        acciones={puede('config.sucursales') && <Boton onClick={() => setAbierto(true)}><Plus className="size-4" /> Nueva sucursal</Boton>}
      />
      {isLoading ? <Cargando /> : (
        <Tabla>
          <thead><tr><th>Cód.</th><th>Nombre</th><th className="hidden md:table-cell">Dirección</th><th>Impresión</th><th>SUNAT</th></tr></thead>
          <tbody>
            {data?.map((s) => (
              <tr key={s.id} className={s.activo ? '' : 'opacity-50'}>
                <td className="font-mono">{s.cod_local}</td>
                <td>{s.nombre} {s.es_principal && <Insignia className="ml-1 bg-acento-50 text-acento-700 ring-acento-100">Principal</Insignia>}</td>
                <td className="hidden md:table-cell">{s.direccion}</td>
                <td>{FORMATOS.find((f) => f.valor === s.formato_impresion)?.etiqueta ?? 'De la empresa'}</td>
                <td>{s.sunat_sucursal_id ? 'Sincronizada' : <span className="text-amber-700">Sin sincronizar</span>}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
      <Dialogo abierto={abierto} titulo="Nueva sucursal" onCerrar={() => setAbierto(false)}>
        <form onSubmit={crear} className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Nombre"><Entrada {...register('nombre', { required: true })} /></Campo>
          <Campo etiqueta="Código de local" ayuda="4 dígitos SUNAT (ej. 0001)"><Entrada maxLength={4} inputMode="numeric" {...register('cod_local', { required: true, pattern: /^\d{4}$/ })} /></Campo>
          <Campo etiqueta="Dirección" className="sm:col-span-2"><Entrada {...register('direccion', { required: true })} /></Campo>
          <Campo etiqueta="Ubigeo"><Entrada maxLength={6} inputMode="numeric" {...register('ubigeo', { required: true, pattern: /^\d{6}$/ })} /></Campo>
          <Campo etiqueta="Formato de impresión">
            <Selector {...register('formato_impresion')}><option value="">De la empresa</option>{FORMATOS.map((f) => <option key={f.valor} value={f.valor}>{f.etiqueta}</option>)}</Selector>
          </Campo>
          <Boton type="submit" cargando={formState.isSubmitting} className="sm:col-span-2 sm:justify-self-start">Crear sucursal</Boton>
        </form>
      </Dialogo>
    </>
  )
}
