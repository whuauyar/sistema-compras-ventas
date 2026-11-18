import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleCheck, Minus, Plus, ReceiptText, Search, Trash2, UserRound, X } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError, mensajeError } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { METODOS_PAGO, type Caja, type Contacto, type Paginado, type Producto } from '@/lib/tipos'
import { cn, soles } from '@/lib/utils'
import { BuscadorProducto, useDebounce } from '@/components/comunes'
import { EstadoSunatBadge } from '@/components/EstadoSunat'
import { MenuImpresion } from '@/components/MenuImpresion'
import { Boton, Campo, Dialogo, Entrada, Selector } from '@/components/ui'
import type { ComprobanteFila } from '../Comprobantes'

interface Linea {
  producto: Producto
  cantidad: number
  precio: number
  descuento: number
}

interface ClienteVenta {
  id?: number
  tipo_doc: string
  num_doc: string
  razon_social: string
  direccion?: string | null
}

const VARIOS: ClienteVenta = { tipo_doc: '0', num_doc: '00000000', razon_social: 'CLIENTES VARIOS' }
const IGV = 0.18

/** Punto de venta: buscar → carrito → cliente → cobrar. Atajos: F2 buscar, F4 cliente, F9 cobrar. */
export function Pos() {
  const { puede } = useSesion()
  const qc = useQueryClient()
  const [lineas, setLineas] = useState<Linea[]>([])
  const [cliente, setCliente] = useState<ClienteVenta>(VARIOS)
  const [tipoDoc, setTipoDoc] = useState<'01' | '03'>('03')
  const [cajaId, setCajaId] = useState('')
  const [elegirCliente, setElegirCliente] = useState(false)
  const [cobrando, setCobrando] = useState(false)
  const [resultado, setResultado] = useState<ComprobanteFila | null>(null)
  const zonaBusqueda = useRef<HTMLDivElement>(null)
  const cajas = useQuery({ queryKey: ['cajas'], queryFn: () => api.get<Caja[]>('/cajas') })
  const abiertas = (cajas.data ?? []).filter((c) => c.apertura)

  useEffect(() => {
    if (!cajaId && abiertas.length === 1) setCajaId(String(abiertas[0].id))
  }, [abiertas, cajaId])

  useEffect(() => {
    const atajos = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault()
        zonaBusqueda.current?.querySelector('input')?.focus()
      }
      if (e.key === 'F4') {
        e.preventDefault()
        setElegirCliente(true)
      }
      if (e.key === 'F9' && lineas.length) {
        e.preventDefault()
        setCobrando(true)
      }
    }
    window.addEventListener('keydown', atajos)
    return () => window.removeEventListener('keydown', atajos)
  }, [lineas.length])

  const agregar = (p: Producto) =>
    setLineas((ls) => {
      const i = ls.findIndex((l) => l.producto.id === p.id)
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, cantidad: l.cantidad + 1 } : l))
      return [...ls, { producto: p, cantidad: 1, precio: p.precio_venta, descuento: 0 }]
    })
  const cambiar = (i: number, c: Partial<Linea>) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...c } : l)))

  const totales = useMemo(() => {
    let gravado = 0
    let otros = 0
    let descuentos = 0
    for (const l of lineas) {
      const importe = l.cantidad * l.precio - l.descuento
      descuentos += l.descuento
      if (l.producto.tip_afe_igv.startsWith('1')) gravado += importe
      else otros += importe
    }
    const base = gravado / (1 + IGV)
    return { base, igv: gravado - base, total: Math.round((gravado + otros) * 100) / 100, descuentos }
  }, [lineas])

  const cambiarCliente = (c: ClienteVenta) => {
    setCliente(c)
    setTipoDoc(c.tipo_doc === '6' ? '01' : '03')
  }
  const reiniciar = () => {
    setLineas([])
    setCliente(VARIOS)
    setTipoDoc('03')
    setResultado(null)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <section className="flex min-w-0 flex-col gap-3">
        <div ref={zonaBusqueda}><BuscadorProducto onElegir={agregar} autoFocus placeholder="F2 · Buscar o escanear producto…" /></div>
        <div className="rounded-lg border border-slate-200 bg-white">
          {lineas.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-slate-500">
              <ReceiptText className="size-8 text-slate-300" />
              <p>Escanee o busque productos para empezar.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {lineas.map((l, i) => {
                const sinStock = l.producto.controla_stock && (l.producto.stock ?? 0) < l.cantidad
                return (
                  <li key={l.producto.id} className="grid grid-cols-[1fr_auto] gap-3 p-3 sm:grid-cols-[1fr_8rem_7rem_6rem_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{l.producto.nombre}</p>
                      <p className={cn('text-xs', sinStock ? 'text-amber-700' : 'text-slate-500')}>{l.producto.codigo}{l.producto.controla_stock && ` · stock ${l.producto.stock ?? 0}`}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Boton variante="secundario" tamano="sm" className="px-2" onClick={() => (l.cantidad > 1 ? cambiar(i, { cantidad: l.cantidad - 1 }) : setLineas(lineas.filter((_, j) => j !== i)))} aria-label="Menos"><Minus className="size-3.5" /></Boton>
                      <Entrada className="h-8 w-14 text-center" type="number" min="0" step="any" value={l.cantidad} onChange={(e) => cambiar(i, { cantidad: Number(e.target.value) })} aria-label="Cantidad" />
                      <Boton variante="secundario" tamano="sm" className="px-2" onClick={() => cambiar(i, { cantidad: l.cantidad + 1 })} aria-label="Más"><Plus className="size-3.5" /></Boton>
                    </div>
                    <Entrada className="h-8 text-right" type="number" step="0.01" min="0" value={l.precio} disabled={!puede('ventas.descuento')} onChange={(e) => cambiar(i, { precio: Number(e.target.value) })} aria-label="Precio" title="Precio con IGV" />
                    {puede('ventas.descuento') ? (
                      <Entrada className="h-8 text-right" type="number" step="0.01" min="0" placeholder="Desc." value={l.descuento || ''} onChange={(e) => cambiar(i, { descuento: Number(e.target.value) })} aria-label="Descuento" />
                    ) : <span />}
                    <div className="flex items-center justify-end gap-2">
                      <span className="w-20 text-right font-medium tabular-nums">{soles(l.cantidad * l.precio - l.descuento)}</span>
                      <button onClick={() => setLineas(lineas.filter((_, j) => j !== i))} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600" aria-label="Quitar"><Trash2 className="size-4" /></button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      <aside className="flex flex-col gap-3 lg:sticky lg:top-0 lg:self-start">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <button onClick={() => setElegirCliente(true)} className="flex w-full items-center gap-3 rounded-md border border-dashed border-slate-300 p-3 text-left hover:border-acento-600">
            <UserRound className="size-5 text-slate-400" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{cliente.razon_social}</span>
              <span className="text-xs text-slate-500">{cliente.tipo_doc === '0' ? 'F4 · Elegir cliente' : `${cliente.tipo_doc === '6' ? 'RUC' : 'DNI'} ${cliente.num_doc}`}</span>
            </span>
          </button>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(['03', '01'] as const).map((t) => (
              <button key={t} disabled={t === '01' && cliente.tipo_doc !== '6'} onClick={() => setTipoDoc(t)}
                className={cn('rounded-md border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40', tipoDoc === t ? 'border-acento-600 bg-acento-50 text-acento-700' : 'border-slate-200')}>
                {t === '03' ? 'Boleta' : 'Factura'}
              </button>
            ))}
          </div>
          {abiertas.length > 0 && (
            <Selector className="mt-3" value={cajaId} onChange={(e) => setCajaId(e.target.value)} aria-label="Caja">
              <option value="">Sin caja</option>
              {abiertas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Selector>
          )}
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-slate-500">Op. gravada</dt><dd className="text-right tabular-nums">{soles(totales.base)}</dd>
            <dt className="text-slate-500">IGV 18%</dt><dd className="text-right tabular-nums">{soles(totales.igv)}</dd>
            {totales.descuentos > 0 && (<><dt className="text-slate-500">Descuentos</dt><dd className="text-right tabular-nums">−{soles(totales.descuentos)}</dd></>)}
          </dl>
          <p className="mt-3 flex items-baseline justify-between border-t border-slate-100 pt-3"><span className="text-sm text-slate-500">Total</span><span className="text-3xl font-semibold tabular-nums">{soles(totales.total)}</span></p>
          <Boton className="mt-4 h-11 w-full text-base" disabled={lineas.length === 0} onClick={() => setCobrando(true)}>Cobrar (F9)</Boton>
          {lineas.length > 0 && <Boton variante="fantasma" className="mt-1 w-full" onClick={reiniciar}>Cancelar venta</Boton>}
        </div>
      </aside>

      {elegirCliente && <ElegirCliente onCerrar={() => setElegirCliente(false)} onElegir={(c) => (cambiarCliente(c), setElegirCliente(false))} />}
      {cobrando && (
        <Cobro
          total={totales.total}
          onCerrar={() => setCobrando(false)}
          onCobrar={async (pagos, credito) => {
            try {
              const r = await api.post<{ comprobante: ComprobanteFila }>('/ventas', {
                tipo_documento: tipoDoc,
                caja_id: cajaId ? Number(cajaId) : null,
                cliente_id: cliente.id,
                cliente: cliente.id ? undefined : { ...cliente, direccion: cliente.direccion || null },
                moneda: 'PEN',
                forma_pago: credito ? 'Credito' : 'Contado',
                cuotas: credito ? [{ monto: totales.total, fecha_pago: credito }] : undefined,
                items: lineas.map((l) => ({
                  producto_id: l.producto.id, cantidad: l.cantidad,
                  precio_unitario: l.precio !== l.producto.precio_venta ? l.precio : undefined,
                  descuento: l.descuento || undefined,
                })),
                pagos: credito ? undefined : pagos,
              })
              setCobrando(false)
              setResultado(r.comprobante)
              qc.invalidateQueries({ queryKey: ['productos'] })
            } catch (e) {
              toast.error(mensajeError(e), { description: e instanceof ApiError && e.errores.length > 1 ? e.errores.map((x) => x.mensaje).join(' · ') : undefined })
            }
          }}
        />
      )}
      {resultado && (
        <Dialogo abierto titulo="Venta registrada" onCerrar={reiniciar}>
          <div className="flex flex-col items-center gap-3 text-center">
            <CircleCheck className="size-10 text-emerald-600" />
            <p className="text-lg font-semibold">{resultado.numero_completo ?? 'Comprobante en cola'}</p>
            <EstadoSunatBadge estado={resultado.sunat_estado} codigo={resultado.sunat_codigo} descripcion={resultado.sunat_descripcion} notas={resultado.sunat_notas} />
            {resultado.sunat_estado === 'error_envio' && <p className="text-sm text-orange-700">El servicio de facturación no respondió. Se enviará automáticamente; podrá imprimir cuando tenga número.</p>}
            <div className="flex gap-2">
              <MenuImpresion id={resultado.id} deshabilitado={!resultado.sunat_api_id} numero={resultado.numero_completo} estado={resultado.sunat_estado} />
              <Boton onClick={reiniciar}>Nueva venta</Boton>
            </div>
          </div>
        </Dialogo>
      )}
    </div>
  )
}

function ElegirCliente({ onCerrar, onElegir }: { onCerrar: () => void; onElegir: (c: ClienteVenta) => void }) {
  const [texto, setTexto] = useState('')
  const [buscando, setBuscando] = useState(false)
  const b = useDebounce(texto.trim())
  const lista = useQuery({ queryKey: ['clientes', 'pos', b], queryFn: () => api.get<Paginado<Contacto>>(`/clientes?por_pagina=8&estado=activos&buscar=${encodeURIComponent(b)}`), enabled: b.length > 1 })
  const consultar = async () => {
    const numero = texto.trim()
    const tipo = numero.length === 11 ? '6' : numero.length === 8 ? '1' : null
    if (!tipo) return toast.error('Ingrese un DNI (8) o RUC (11).')
    setBuscando(true)
    try {
      const d = await api.get<{ razon_social?: string; nombre?: string; direccion?: string }>(`/consultas/documento?tipo=${tipo}&numero=${numero}`)
      const nuevo = await api.post<Contacto>('/clientes', { tipo_doc: tipo, num_doc: numero, razon_social: d.razon_social ?? d.nombre ?? numero, direccion: d.direccion || null }).catch(() => null)
      onElegir({ id: nuevo?.id, tipo_doc: tipo, num_doc: numero, razon_social: d.razon_social ?? d.nombre ?? numero, direccion: d.direccion })
    } catch (e) {
      toast.error(mensajeError(e))
    } finally {
      setBuscando(false)
    }
  }
  return (
    <Dialogo abierto titulo="Cliente" onCerrar={onCerrar}>
      <div className="flex flex-col gap-3">
        <div className="flex gap-1.5">
          <Entrada autoFocus placeholder="DNI, RUC o nombre" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && consultar()} />
          <Boton variante="secundario" cargando={buscando} onClick={consultar} title="Consultar SUNAT/RENIEC"><Search className="size-4" /></Boton>
        </div>
        <ul className="divide-y divide-slate-100 text-sm">
          <li><button className="w-full px-2 py-2 text-left hover:bg-slate-50" onClick={() => onElegir(VARIOS)}>CLIENTES VARIOS <span className="text-slate-400">(boleta sin documento)</span></button></li>
          {lista.data?.data.map((c) => (
            <li key={c.id}><button className="w-full px-2 py-2 text-left hover:bg-slate-50" onClick={() => onElegir({ id: c.id, tipo_doc: c.tipo_doc, num_doc: c.num_doc, razon_social: c.razon_social, direccion: c.direccion })}>
              {c.razon_social} <span className="text-slate-400">{c.num_doc}</span>
            </button></li>
          ))}
        </ul>
      </div>
    </Dialogo>
  )
}

function Cobro({ total, onCerrar, onCobrar }: { total: number; onCerrar: () => void; onCobrar: (pagos: Array<{ metodo: string; monto: number; referencia?: string }>, credito: string | null) => Promise<void> }) {
  const [pagos, setPagos] = useState([{ metodo: 'efectivo', monto: total, referencia: '' }])
  const [credito, setCredito] = useState(false)
  const [vence, setVence] = useState(() => new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10))
  const [enviando, setEnviando] = useState(false)
  const pagado = pagos.reduce((s, p) => s + Number(p.monto || 0), 0)
  const efectivo = pagos.filter((p) => p.metodo === 'efectivo').reduce((s, p) => s + Number(p.monto || 0), 0)
  const vuelto = Math.max(0, Math.round((pagado - total) * 100) / 100)
  const valido = credito || (pagado >= total && vuelto <= efectivo)
  const cobrar = async () => {
    setEnviando(true)
    await onCobrar(pagos.map((p) => ({ metodo: p.metodo, monto: Number(p.monto), referencia: p.referencia || undefined })), credito ? vence : null)
    setEnviando(false)
  }
  return (
    <Dialogo abierto titulo={`Cobrar ${soles(total)}`} onCerrar={onCerrar}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          {[false, true].map((c) => (
            <button key={String(c)} onClick={() => setCredito(c)} className={cn('rounded-md border px-3 py-2 text-sm font-medium', credito === c ? 'border-acento-600 bg-acento-50 text-acento-700' : 'border-slate-200')}>{c ? 'Crédito' : 'Contado'}</button>
          ))}
        </div>
        {credito ? (
          <Campo etiqueta="Vencimiento (1 cuota)"><Entrada type="date" value={vence} onChange={(e) => setVence(e.target.value)} /></Campo>
        ) : (
          <>
            {pagos.map((p, i) => (
              <div key={i} className="grid grid-cols-[8rem_1fr_auto] gap-2">
                <Selector value={p.metodo} onChange={(e) => setPagos(pagos.map((x, j) => (j === i ? { ...x, metodo: e.target.value } : x)))}>{METODOS_PAGO.map((m) => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}</Selector>
                <Entrada type="number" step="0.01" min="0" value={p.monto} onChange={(e) => setPagos(pagos.map((x, j) => (j === i ? { ...x, monto: Number(e.target.value) } : x)))} autoFocus={i === 0} onFocus={(e) => e.target.select()} />
                {pagos.length > 1 ? <Boton variante="fantasma" onClick={() => setPagos(pagos.filter((_, j) => j !== i))} aria-label="Quitar pago"><X className="size-4" /></Boton> : <span />}
              </div>
            ))}
            <Boton variante="secundario" tamano="sm" className="self-start" onClick={() => setPagos([...pagos, { metodo: 'yape', monto: Math.max(0, Math.round((total - pagado) * 100) / 100), referencia: '' }])}><Plus className="size-3.5" /> Pago mixto</Boton>
            <dl className="grid grid-cols-2 text-sm">
              <dt className="text-slate-500">Recibido</dt><dd className="text-right tabular-nums">{soles(pagado)}</dd>
              <dt className="text-slate-500">Vuelto</dt><dd className="text-right text-lg font-semibold tabular-nums">{soles(vuelto)}</dd>
            </dl>
            {pagado < total && <p className="text-sm text-rose-600">Falta {soles(total - pagado)}.</p>}
            {vuelto > efectivo && <p className="text-sm text-rose-600">Solo el efectivo puede dar vuelto.</p>}
          </>
        )}
        <Boton className="h-11 text-base" cargando={enviando} disabled={!valido} onClick={cobrar}>Confirmar y emitir</Boton>
      </div>
    </Dialogo>
  )
}
