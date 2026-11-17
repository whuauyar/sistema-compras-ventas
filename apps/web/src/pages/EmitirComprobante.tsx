import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError, mensajeError } from '@/lib/api'
import { AFECTACIONES, TIPOS_DOC_IDENTIDAD, UNIDADES } from '@/lib/sunat'
import { soles } from '@/lib/utils'
import { Boton, Campo, Encabezado, Entrada, Selector, Tarjeta } from '@/components/ui'
import type { ComprobanteFila } from './Comprobantes'

interface Serie {
  id: number
  tipo_documento: string
  serie: string
  activo: boolean
}

interface Formulario {
  tipo_documento: '01' | '03'
  serie: string
  moneda: 'PEN' | 'USD'
  forma_pago: 'Contado' | 'Credito'
  cliente: { tipo_doc: string; num_doc: string; razon_social: string; direccion: string }
  items: Array<{ codigo: string; descripcion: string; unidad: string; cantidad: number; precio_unitario: number; tip_afe_igv: string }>
  cuota_fecha: string
}

const IGV = 0.18
const itemVacio = { codigo: '', descripcion: '', unidad: 'NIU', cantidad: 1, precio_unitario: 0, tip_afe_igv: '10' }

/**
 * Emisión directa de factura/boleta (sirve para la prueba de humo de la fase 2).
 * El POS con productos y stock llega en la fase de Ventas.
 */
export function EmitirComprobante() {
  const navegar = useNavigate()
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [buscando, setBuscando] = useState(false)
  const series = useQuery({ queryKey: ['series'], queryFn: () => api.get<Serie[]>('/series') })

  const { register, control, handleSubmit, setValue, getValues, formState } = useForm<Formulario>({
    defaultValues: {
      tipo_documento: '03',
      serie: '',
      moneda: 'PEN',
      forma_pago: 'Contado',
      cliente: { tipo_doc: '0', num_doc: '00000000', razon_social: 'CLIENTES VARIOS', direccion: '' },
      items: [itemVacio],
      cuota_fecha: '',
    },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const [tipo, items, formaPago, moneda] = useWatch({ control, name: ['tipo_documento', 'items', 'forma_pago', 'moneda'] })

  const seriesTipo = (series.data ?? []).filter((s) => s.tipo_documento === tipo && s.activo)
  const totales = useMemo(() => {
    let gravado = 0
    let otros = 0
    for (const i of items ?? []) {
      const importe = Number(i.cantidad || 0) * Number(i.precio_unitario || 0)
      if (String(i.tip_afe_igv).startsWith('1')) gravado += importe
      else otros += importe
    }
    const base = gravado / (1 + IGV)
    return { base, igv: gravado - base, total: gravado + otros }
  }, [items])

  const cambiarTipo = (t: '01' | '03') => {
    setValue('tipo_documento', t)
    setValue('serie', '')
    if (t === '01') setValue('cliente', { tipo_doc: '6', num_doc: '', razon_social: '', direccion: '' })
    else setValue('cliente', { tipo_doc: '0', num_doc: '00000000', razon_social: 'CLIENTES VARIOS', direccion: '' })
  }

  const buscarCliente = async () => {
    const { tipo_doc, num_doc } = getValues('cliente')
    if (!['1', '6'].includes(tipo_doc)) return
    setBuscando(true)
    try {
      const d = await api.get<{ razon_social?: string; nombre?: string; direccion?: string }>(`/consultas/documento?tipo=${tipo_doc}&numero=${num_doc}`)
      setValue('cliente.razon_social', d.razon_social ?? d.nombre ?? '')
      setValue('cliente.direccion', d.direccion ?? '')
    } catch (e) {
      toast.error(mensajeError(e))
    } finally {
      setBuscando(false)
    }
  }

  const enviar = handleSubmit(async (d) => {
    setErrores({})
    const cuerpo = {
      tipo_documento: d.tipo_documento,
      serie: d.serie || undefined,
      moneda: d.moneda,
      forma_pago: d.forma_pago,
      cuotas: d.forma_pago === 'Credito' ? [{ monto: Number(totales.total.toFixed(2)), fecha_pago: d.cuota_fecha }] : undefined,
      cliente: { ...d.cliente, direccion: d.cliente.direccion || null },
      items: d.items.map((i) => ({ ...i, codigo: i.codigo || undefined, cantidad: Number(i.cantidad), precio_unitario: Number(i.precio_unitario) })),
    }
    try {
      const c = await api.post<ComprobanteFila>('/comprobantes', cuerpo)
      if (c.sunat_estado === 'error_envio') toast.warning('Guardado. El servicio de facturación no responde: se enviará automáticamente.')
      else toast.success(`${c.numero_completo} emitido.`)
      navegar('/ventas/comprobantes')
    } catch (e) {
      if (e instanceof ApiError) setErrores(Object.fromEntries(e.errores.map((x) => [x.campo, x.mensaje])))
      toast.error(mensajeError(e))
    }
  })

  return (
    <>
      <Encabezado titulo="Emitir comprobante" descripcion="El precio unitario incluye IGV." />
      <form onSubmit={enviar} className="flex flex-col gap-5">
        <Tarjeta titulo="Documento">
          <div className="grid gap-4 sm:grid-cols-4">
            <Campo etiqueta="Tipo">
              <Selector value={tipo} onChange={(e) => cambiarTipo(e.target.value as '01' | '03')}>
                <option value="03">Boleta</option>
                <option value="01">Factura</option>
              </Selector>
            </Campo>
            <Campo etiqueta="Serie" error={errores.serie}>
              <Selector {...register('serie')}>
                <option value="">Automática</option>
                {seriesTipo.map((s) => <option key={s.id} value={s.serie}>{s.serie}</option>)}
              </Selector>
            </Campo>
            <Campo etiqueta="Moneda">
              <Selector {...register('moneda')}><option value="PEN">Soles</option><option value="USD">Dólares</option></Selector>
            </Campo>
            <Campo etiqueta="Forma de pago" error={errores.cuotas}>
              <Selector {...register('forma_pago')}><option value="Contado">Contado</option><option value="Credito">Crédito</option></Selector>
            </Campo>
            {formaPago === 'Credito' && (
              <Campo etiqueta="Vencimiento (1 cuota)"><Entrada type="date" required {...register('cuota_fecha')} /></Campo>
            )}
          </div>
        </Tarjeta>

        <Tarjeta titulo="Cliente">
          <div className="grid gap-4 sm:grid-cols-6">
            <Campo etiqueta="Documento" className="sm:col-span-2" error={errores['cliente.tipo_doc']}>
              <Selector {...register('cliente.tipo_doc')}>
                {TIPOS_DOC_IDENTIDAD.filter((t) => tipo === '03' || t.valor === '6').map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
              </Selector>
            </Campo>
            <Campo etiqueta="Número" className="sm:col-span-2" error={errores['cliente.num_doc']}>
              <div className="flex gap-1.5">
                <Entrada {...register('cliente.num_doc')} />
                <Boton type="button" variante="secundario" onClick={buscarCliente} cargando={buscando} title="Buscar en SUNAT/RENIEC"><Search className="size-4" /></Boton>
              </div>
            </Campo>
            <Campo etiqueta="Nombre / razón social" className="sm:col-span-2" error={errores['cliente.razon_social']}>
              <Entrada {...register('cliente.razon_social')} />
            </Campo>
            <Campo etiqueta={tipo === '01' ? 'Dirección (obligatoria)' : 'Dirección'} className="sm:col-span-6" error={errores['cliente.direccion']}>
              <Entrada {...register('cliente.direccion')} />
            </Campo>
          </div>
        </Tarjeta>

        <Tarjeta titulo="Ítems" acciones={<Boton type="button" variante="secundario" tamano="sm" onClick={() => append(itemVacio)}><Plus className="size-3.5" /> Agregar ítem</Boton>}>
          <div className="flex flex-col gap-3">
            {fields.map((f, i) => (
              <div key={f.id} className="grid grid-cols-2 gap-2 rounded-md border border-slate-100 p-3 sm:grid-cols-12 sm:border-0 sm:p-0">
                <Entrada className="col-span-2 sm:col-span-4" placeholder="Descripción" aria-invalid={Boolean(errores[`items.${i}.descripcion`])} {...register(`items.${i}.descripcion`, { required: true })} />
                <Selector className="sm:col-span-2" {...register(`items.${i}.unidad`)}>{UNIDADES.map((u) => <option key={u.valor} value={u.valor}>{u.etiqueta}</option>)}</Selector>
                <Selector className="sm:col-span-2" {...register(`items.${i}.tip_afe_igv`)}>{AFECTACIONES.map((a) => <option key={a.valor} value={a.valor}>{a.etiqueta}</option>)}</Selector>
                <Entrada className="sm:col-span-1" type="number" step="any" min="0" placeholder="Cant." {...register(`items.${i}.cantidad`, { valueAsNumber: true })} />
                <Entrada className="sm:col-span-2" type="number" step="0.01" min="0" placeholder="P. unit." {...register(`items.${i}.precio_unitario`, { valueAsNumber: true })} />
                <Boton type="button" variante="fantasma" className="sm:col-span-1" disabled={fields.length === 1} onClick={() => remove(i)} aria-label="Quitar ítem"><Trash2 className="size-4" /></Boton>
              </div>
            ))}
          </div>
          {errores.items && <p className="mt-2 text-sm text-rose-600">{errores.items}</p>}
          <dl className="ml-auto mt-5 grid w-full max-w-xs grid-cols-2 gap-y-1 text-sm">
            <dt className="text-slate-500">Op. gravada</dt><dd className="text-right tabular-nums">{soles(totales.base, moneda)}</dd>
            <dt className="text-slate-500">IGV 18%</dt><dd className="text-right tabular-nums">{soles(totales.igv, moneda)}</dd>
            <dt className="font-semibold">Total</dt><dd className="text-right font-semibold tabular-nums">{soles(totales.total, moneda)}</dd>
          </dl>
        </Tarjeta>

        <div className="flex gap-2">
          <Boton type="submit" cargando={formState.isSubmitting}>Emitir {tipo === '01' ? 'factura' : 'boleta'}</Boton>
          <Boton type="button" variante="secundario" onClick={() => navegar(-1)}>Cancelar</Boton>
        </div>
      </form>
    </>
  )
}
