import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, mensajeError } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { FORMATOS } from '@/lib/sunat'
import { Boton, Campo, Cargando, Encabezado, Entrada, Insignia, Selector, Tarjeta } from '@/components/ui'

interface EmpresaDetalle {
  id: number
  ruc: string
  razon_social: string
  nombre_comercial: string | null
  direccion: string
  ubigeo: string
  regimen: string
  entorno: 'beta' | 'production'
  gre_configurada: boolean
  formato_impresion: string
  permitir_venta_sin_stock: boolean
  sunat_api_key: string
}

export function ConfigEmpresa() {
  const { puede } = useSesion()
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['empresa'], queryFn: () => api.get<EmpresaDetalle>('/empresa') })
  const { register, handleSubmit, reset, formState } = useForm<Pick<EmpresaDetalle, 'nombre_comercial' | 'formato_impresion' | 'permitir_venta_sin_stock'>>()
  useEffect(() => {
    if (data) reset({ nombre_comercial: data.nombre_comercial, formato_impresion: data.formato_impresion, permitir_venta_sin_stock: data.permitir_venta_sin_stock })
  }, [data, reset])

  if (isLoading || !data) return <Cargando />
  const editable = puede('config.empresa')
  const guardar = handleSubmit(async (d) => {
    try {
      await api.put('/empresa', d)
      toast.success('Empresa actualizada.')
      qc.invalidateQueries({ queryKey: ['empresa'] })
    } catch (e) {
      toast.error(mensajeError(e))
    }
  })

  return (
    <>
      <Encabezado titulo="Empresa" descripcion="Datos fiscales y preferencias." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Tarjeta titulo="Datos fiscales" descripcion="Provienen del servicio de facturación SUNAT.">
          <dl className="grid grid-cols-3 gap-y-2 text-sm">
            <dt className="text-slate-500">RUC</dt><dd className="col-span-2 font-medium">{data.ruc}</dd>
            <dt className="text-slate-500">Razón social</dt><dd className="col-span-2">{data.razon_social}</dd>
            <dt className="text-slate-500">Dirección</dt><dd className="col-span-2">{data.direccion} ({data.ubigeo})</dd>
            <dt className="text-slate-500">Régimen</dt><dd className="col-span-2 uppercase">{data.regimen}</dd>
            <dt className="text-slate-500">Entorno</dt>
            <dd className="col-span-2">
              {data.entorno === 'beta' ? <Insignia className="bg-amber-50 text-amber-700 ring-amber-200">Pruebas (beta)</Insignia> : <Insignia className="bg-emerald-50 text-emerald-700 ring-emerald-200">Producción</Insignia>}
            </dd>
            <dt className="text-slate-500">API Key</dt><dd className="col-span-2 font-mono text-xs">{data.sunat_api_key}</dd>
            <dt className="text-slate-500">Guías (GRE)</dt>
            <dd className="col-span-2">{data.gre_configurada ? 'Configuradas' : <span className="text-amber-700">Sin credenciales GRE: no podrá emitir guías.</span>}</dd>
          </dl>
        </Tarjeta>
        <Tarjeta titulo="Preferencias">
          <form onSubmit={guardar} className="flex flex-col gap-4">
            <Campo etiqueta="Nombre comercial"><Entrada disabled={!editable} {...register('nombre_comercial')} /></Campo>
            <Campo etiqueta="Formato de impresión por defecto" ayuda="Cada sucursal, caja o usuario puede tener el suyo.">
              <Selector disabled={!editable} {...register('formato_impresion')}>{FORMATOS.map((f) => <option key={f.valor} value={f.valor}>{f.etiqueta}</option>)}</Selector>
            </Campo>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-acento-600" disabled={!editable} {...register('permitir_venta_sin_stock')} /> Permitir vender sin stock
            </label>
            {editable && <Boton type="submit" cargando={formState.isSubmitting} className="self-start">Guardar</Boton>}
          </form>
        </Tarjeta>
      </div>
    </>
  )
}
