import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, Eye, Plus, ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'
import { api, mensajeError } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { ESTADO_CUOTA, hoy, type Almacen, type Contacto, type Paginado } from '@/lib/tipos'
import { fecha, soles } from '@/lib/utils'
import { Paginacion, useDebounce } from '@/components/comunes'
import { Boton, Campo, Cargando, Dialogo, Encabezado, Entrada, Insignia, Selector, Tabla, Vacio } from '@/components/ui'
import { FormContacto } from '../Contactos'
import { LineasCompra, type LineaCompra } from './LineasCompra'

interface CompraFila {
  id: number
  tipo_documento: string
  serie: string
  numero: string
  fecha_emision: string
  moneda: string
  forma_pago: string
  total: number
  estado: string
  proveedor: Contacto
}

const TIPOS_COMPRA: Record<string, string> = { '01': 'Factura', '03': 'Boleta', '12': 'Ticket', '00': 'Otro' }

export function Compras() {
  const { puede } = useSesion()
  const qc = useQueryClient()
  const [buscar, setBuscar] = useState('')
  const [pagina, setPagina] = useState(1)
  const [nueva, setNueva] = useState(false)
  const [detalle, setDetalle] = useState<number | null>(null)
  const b = useDebounce(buscar)
  const lista = useQuery({ queryKey: ['compras', b, pagina], queryFn: () => api.get<Paginado<CompraFila>>(`/compras?pagina=${pagina}&buscar=${encodeURIComponent(b)}`) })

  const anular = async (c: CompraFila) => {
    if (!window.confirm(`¿Anular la compra ${c.serie}-${c.numero}? Se retirará el stock ingresado.`)) return
    try {
      await api.post(`/compras/${c.id}/anular`)
      toast.success('Compra anulada.')
      qc.invalidateQueries({ queryKey: ['compras'] })
    } catch (e) {
      toast.error(mensajeError(e))
    }
  }

  return (
    <>
      <Encabezado titulo="Compras" descripcion="Documentos de proveedores. Al registrar, el stock entra al costo sin IGV." acciones={puede('compras.crear') && <Boton onClick={() => setNueva(true)}><Plus className="size-4" /> Registrar compra</Boton>} />
      <Entrada className="mb-4 max-w-sm" placeholder="Serie-número o proveedor" value={buscar} onChange={(e) => (setBuscar(e.target.value), setPagina(1))} />
      {lista.isLoading ? <Cargando /> : !lista.data?.data.length ? (
        <Vacio icono={<ShoppingCart className="size-8" />} titulo="Sin compras" />
      ) : (
        <>
          <Tabla>
            <thead><tr><th>Documento</th><th>Proveedor</th><th className="hidden md:table-cell">Fecha</th><th>Pago</th><th className="text-right">Total</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {lista.data.data.map((c) => (
                <tr key={c.id} className={c.estado === 'anulada' ? 'opacity-50' : ''}>
                  <td><p className="font-medium">{c.serie}-{c.numero}</p><p className="text-xs text-slate-500">{TIPOS_COMPRA[c.tipo_documento]}</p></td>
                  <td className="max-w-[16rem] truncate">{c.proveedor?.razon_social}</td>
                  <td className="hidden md:table-cell">{fecha(c.fecha_emision)}</td>
                  <td>{c.forma_pago}</td>
                  <td className="text-right tabular-nums">{soles(c.total, c.moneda)}</td>
                  <td><Insignia className={c.estado === 'anulada' ? 'bg-slate-100 text-slate-500 ring-slate-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}>{c.estado}</Insignia></td>
                  <td className="text-right whitespace-nowrap">
                    <Boton variante="fantasma" tamano="sm" onClick={() => setDetalle(c.id)} aria-label="Ver"><Eye className="size-3.5" /></Boton>
                    {c.estado === 'registrada' && puede('compras.anular') && <Boton variante="fantasma" tamano="sm" onClick={() => anular(c)} aria-label="Anular"><Ban className="size-3.5" /></Boton>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabla>
          <Paginacion meta={lista.data.meta} pagina={pagina} onCambio={setPagina} />
        </>
      )}
      {nueva && <FormCompra onCerrar={() => setNueva(false)} onGuardado={() => qc.invalidateQueries({ queryKey: ['compras'] })} />}
      {detalle && <DetalleCompra id={detalle} onCerrar={() => setDetalle(null)} />}
    </>
  )
}

function DetalleCompra({ id, onCerrar }: { id: number; onCerrar: () => void }) {
  const { data } = useQuery({
    queryKey: ['compra', id],
    queryFn: () => api.get<CompraFila & { items: Array<{ id: number; descripcion: string; cantidad: number; precio_unitario: number; costo_unitario: number; subtotal: number }>; cuotas: Array<{ id: number; numero_cuota: number; fecha_vencimiento: string; monto: number; saldo: number; estado: string }> }>(`/compras/${id}`),
  })
  return (
    <Dialogo abierto titulo={data ? `Compra ${data.serie}-${data.numero}` : 'Compra'} onCerrar={onCerrar} ancho="max-w-2xl">
      {!data ? <Cargando /> : (
        <div className="flex flex-col gap-4 text-sm">
          <p>{data.proveedor.razon_social} · {fecha(data.fecha_emision)} · {data.forma_pago}</p>
          <Tabla>
            <thead><tr><th>Producto</th><th className="text-right">Cant.</th><th className="text-right">P. unit.</th><th className="text-right">Costo s/IGV</th><th className="text-right">Subtotal</th></tr></thead>
            <tbody>{data.items.map((i) => <tr key={i.id}><td>{i.descripcion}</td><td className="text-right">{i.cantidad}</td><td className="text-right">{soles(i.precio_unitario, data.moneda)}</td><td className="text-right">{soles(i.costo_unitario)}</td><td className="text-right">{soles(i.subtotal, data.moneda)}</td></tr>)}</tbody>
          </Tabla>
          <div>
            <p className="mb-1 font-medium">Cuotas</p>
            {data.cuotas.map((c) => <p key={c.id} className="flex justify-between"><span>Cuota {c.numero_cuota} · vence {fecha(c.fecha_vencimiento)}</span><span>{soles(c.monto, data.moneda)} <Insignia className={ESTADO_CUOTA[c.estado]}>{c.estado}</Insignia></span></p>)}
          </div>
        </div>
      )}
    </Dialogo>
  )
}

export function FormCompra({ onCerrar, onGuardado, desdeOrden }: { onCerrar: () => void; onGuardado: () => void; desdeOrden?: { id: number; proveedor_id: number; almacen_id: number; moneda: string; lineas: LineaCompra[] } }) {
  const almacenes = useQuery({ queryKey: ['almacenes'], queryFn: () => api.get<Almacen[]>('/almacenes') })
  const proveedores = useQuery({ queryKey: ['proveedores', 'todos'], queryFn: () => api.get<Paginado<Contacto>>('/proveedores?por_pagina=200&estado=activos') })
  const [nuevoProveedor, setNuevoProveedor] = useState(false)
  const [f, setF] = useState({
    proveedor_id: desdeOrden ? String(desdeOrden.proveedor_id) : '',
    almacen_id: desdeOrden ? String(desdeOrden.almacen_id) : '',
    tipo_documento: '01', serie: '', numero: '', fecha_emision: hoy(), moneda: desdeOrden?.moneda ?? 'PEN', tipo_cambio: '',
    forma_pago: 'Contado', dias_credito: '30', observacion: '',
  })
  const [lineas, setLineas] = useState<LineaCompra[]>(desdeOrden?.lineas ?? [])
  const [guardando, setGuardando] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  const guardar = async () => {
    setGuardando(true)
    try {
      await api.post('/compras', {
        proveedor_id: Number(f.proveedor_id),
        almacen_id: Number(f.almacen_id || almacenes.data?.[0]?.id),
        orden_compra_id: desdeOrden?.id,
        tipo_documento: f.tipo_documento, serie: f.serie, numero: f.numero, fecha_emision: f.fecha_emision, moneda: f.moneda,
        tipo_cambio: f.moneda === 'USD' ? Number(f.tipo_cambio) : undefined,
        forma_pago: f.forma_pago, dias_credito: f.forma_pago === 'Credito' ? Number(f.dias_credito) : undefined,
        observacion: f.observacion || null,
        items: lineas.map(({ producto_id, cantidad, precio_unitario, tip_afe_igv }) => ({ producto_id, cantidad, precio_unitario, tip_afe_igv })),
      })
      toast.success('Compra registrada. Stock actualizado.')
      onGuardado()
      onCerrar()
    } catch (e) {
      toast.error(mensajeError(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialogo abierto titulo={desdeOrden ? 'Recibir orden de compra' : 'Registrar compra'} onCerrar={onCerrar} ancho="max-w-3xl">
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Campo etiqueta="Proveedor" className="sm:col-span-3">
            <div className="flex gap-1.5">
              <Selector value={f.proveedor_id} onChange={set('proveedor_id')} disabled={Boolean(desdeOrden)}>
                <option value="">Elegir…</option>
                {proveedores.data?.data.map((p) => <option key={p.id} value={p.id}>{p.razon_social} · {p.num_doc}</option>)}
              </Selector>
              {!desdeOrden && <Boton type="button" variante="secundario" onClick={() => setNuevoProveedor(true)}>Nuevo</Boton>}
            </div>
          </Campo>
          <Campo etiqueta="Almacén"><Selector value={f.almacen_id} onChange={set('almacen_id')}>{almacenes.data?.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Selector></Campo>
          <Campo etiqueta="Documento"><Selector value={f.tipo_documento} onChange={set('tipo_documento')}>{Object.entries(TIPOS_COMPRA).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</Selector></Campo>
          <Campo etiqueta="Serie"><Entrada className="uppercase" maxLength={4} value={f.serie} onChange={set('serie')} /></Campo>
          <Campo etiqueta="Número"><Entrada inputMode="numeric" value={f.numero} onChange={set('numero')} /></Campo>
          <Campo etiqueta="Fecha"><Entrada type="date" value={f.fecha_emision} onChange={set('fecha_emision')} /></Campo>
          <Campo etiqueta="Moneda"><Selector value={f.moneda} onChange={set('moneda')}><option value="PEN">Soles</option><option value="USD">Dólares</option></Selector></Campo>
          {f.moneda === 'USD' && <Campo etiqueta="Tipo de cambio"><Entrada type="number" step="0.001" value={f.tipo_cambio} onChange={set('tipo_cambio')} /></Campo>}
          <Campo etiqueta="Pago"><Selector value={f.forma_pago} onChange={set('forma_pago')}><option value="Contado">Contado</option><option value="Credito">Crédito</option></Selector></Campo>
          {f.forma_pago === 'Credito' && <Campo etiqueta="Días de crédito"><Entrada type="number" min={1} value={f.dias_credito} onChange={set('dias_credito')} /></Campo>}
        </div>
        <LineasCompra lineas={lineas} setLineas={setLineas} moneda={f.moneda} />
        <Boton onClick={guardar} cargando={guardando} disabled={!f.proveedor_id || !f.serie || !f.numero || lineas.length === 0} className="self-start">Registrar compra</Boton>
      </div>
      {nuevoProveedor && (
        <FormContacto tipo="proveedores" contacto={null} onCerrar={() => setNuevoProveedor(false)} onGuardado={(p) => { proveedores.refetch(); setF((x) => ({ ...x, proveedor_id: String(p.id) })) }} />
      )}
    </Dialogo>
  )
}
