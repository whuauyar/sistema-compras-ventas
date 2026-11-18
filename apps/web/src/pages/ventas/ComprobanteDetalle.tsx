import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Ban, FileMinus2, FilePlus2, RefreshCw, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { api, mensajeError } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { TIPOS_DOCUMENTO, type EstadoSunat } from '@/lib/sunat'
import { fecha, soles } from '@/lib/utils'
import { EstadoSunatBadge } from '@/components/EstadoSunat'
import { MenuImpresion } from '@/components/MenuImpresion'
import { ArchivosSunat } from '@/components/ArchivosSunat'
import { Boton, Campo, Cargando, Dialogo, Encabezado, Entrada, Selector, Tabla, Tarjeta } from '@/components/ui'
import { FormGuia } from './Guias'

interface Detalle {
  id: number
  tipo_documento: string
  serie: string
  numero_completo: string | null
  fecha_emision: string
  moneda: string
  cliente_tipo_doc: string
  cliente_num_doc: string
  cliente_razon_social: string
  total_gravadas: number
  total_igv: number
  total: number
  venta_id: number | null
  doc_referencia_id: number | null
  sunat_api_id: number | null
  sunat_estado: EstadoSunat
  sunat_codigo: string | null
  sunat_descripcion: string | null
  sunat_notas: unknown
  cod_motivo: string | null
  des_motivo: string | null
  payload: { items?: Array<{ descripcion: string; cantidad: number; precio_unitario: number; unidad: string }> }
}

interface VentaItem {
  id: number
  descripcion: string
  cantidad: number
  cantidad_devuelta: number
  precio_unitario: number
}

/** Detalle del comprobante con sus acciones: NC, ND, guía y anulación. */
export function ComprobanteDetalle() {
  const { id } = useParams()
  const { puede } = useSesion()
  const qc = useQueryClient()
  const [dialogo, setDialogo] = useState<'nc' | 'nd' | 'anular' | 'guia' | null>(null)
  const c = useQuery({ queryKey: ['comprobante', id], queryFn: () => api.get<Detalle>(`/comprobantes/${id}`) })
  const relacionados = useQuery({ queryKey: ['comprobante', id, 'rel'], queryFn: () => api.get<Detalle[]>(`/comprobantes/${id}/relacionados`) })
  const refrescar = () => (qc.invalidateQueries({ queryKey: ['comprobante', id] }), qc.invalidateQueries({ queryKey: ['comprobantes'] }))

  const reconsultar = async () => {
    try {
      await api.post(`/comprobantes/${id}/reconsultar`)
      refrescar()
    } catch (e) {
      toast.error(mensajeError(e))
    }
  }

  if (c.isLoading || !c.data) return <Cargando />
  const d = c.data
  const esVenta = ['01', '03'].includes(d.tipo_documento)
  const aceptado = d.sunat_estado === 'aceptado'

  return (
    <>
      <Link to="/ventas/comprobantes" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" /> Comprobantes</Link>
      <Encabezado
        titulo={`${TIPOS_DOCUMENTO[d.tipo_documento]} ${d.numero_completo ?? `${d.serie}-…`}`}
        descripcion={`${fecha(d.fecha_emision)} · ${d.cliente_razon_social} (${d.cliente_num_doc})`}
        acciones={
          <>
            {['pendiente', 'enviado', 'error_envio', 'anulacion_en_proceso'].includes(d.sunat_estado) && <Boton variante="secundario" onClick={reconsultar}><RefreshCw className="size-4" /> Consultar SUNAT</Boton>}
            {esVenta && aceptado && puede('comprobantes.emitir_nc') && <Boton variante="secundario" onClick={() => setDialogo('nc')}><FileMinus2 className="size-4" /> Nota de crédito</Boton>}
            {esVenta && aceptado && puede('comprobantes.emitir_nd') && <Boton variante="secundario" onClick={() => setDialogo('nd')}><FilePlus2 className="size-4" /> Nota de débito</Boton>}
            {esVenta && d.venta_id && puede('guias.emitir') && <Boton variante="secundario" onClick={() => setDialogo('guia')}><Truck className="size-4" /> Guía de remisión</Boton>}
            {['01', '03', '07', '08'].includes(d.tipo_documento) && aceptado && puede('comprobantes.anular') && <Boton variante="secundario" onClick={() => setDialogo('anular')}><Ban className="size-4" /> Anular</Boton>}
            <MenuImpresion id={d.id} deshabilitado={!d.sunat_api_id} />
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <Tarjeta titulo="Detalle">
          <Tabla>
            <thead><tr><th>Descripción</th><th className="text-right">Cant.</th><th className="text-right">P. unit.</th><th className="text-right">Importe</th></tr></thead>
            <tbody>
              {(d.payload.items ?? []).map((i, k) => (
                <tr key={k}><td>{i.descripcion}</td><td className="text-right">{i.cantidad}</td><td className="text-right tabular-nums">{soles(i.precio_unitario, d.moneda)}</td><td className="text-right tabular-nums">{soles(i.cantidad * i.precio_unitario, d.moneda)}</td></tr>
              ))}
            </tbody>
          </Tabla>
          {d.tipo_documento !== '09' && (
            <dl className="ml-auto mt-4 grid w-64 grid-cols-2 gap-y-1 text-sm">
              <dt className="text-slate-500">Op. gravada</dt><dd className="text-right tabular-nums">{soles(d.total_gravadas, d.moneda)}</dd>
              <dt className="text-slate-500">IGV</dt><dd className="text-right tabular-nums">{soles(d.total_igv, d.moneda)}</dd>
              <dt className="font-semibold">Total</dt><dd className="text-right font-semibold tabular-nums">{soles(d.total, d.moneda)}</dd>
            </dl>
          )}
        </Tarjeta>
        <div className="flex flex-col gap-4">
          <Tarjeta titulo="Estado SUNAT">
            <EstadoSunatBadge estado={d.sunat_estado} codigo={d.sunat_codigo} descripcion={d.sunat_descripcion} notas={d.sunat_notas} />
            {d.sunat_codigo && d.sunat_codigo !== '0' && <p className="mt-2 text-sm text-slate-600">Código {d.sunat_codigo}</p>}
            {d.sunat_descripcion && <p className="mt-1 text-sm text-slate-600">{d.sunat_descripcion}</p>}
            <ArchivosSunat className="mt-3" id={d.id} registrado={Boolean(d.sunat_api_id)} estado={d.sunat_estado} />
            {d.des_motivo && <p className="mt-2 text-sm">Motivo: {d.des_motivo}</p>}
            {d.doc_referencia_id && <Link className="mt-2 block text-sm text-acento-700 hover:underline" to={`/ventas/comprobantes/${d.doc_referencia_id}`}>Ver documento de origen</Link>}
          </Tarjeta>
          {(relacionados.data?.length ?? 0) > 0 && (
            <Tarjeta titulo="Documentos relacionados">
              <ul className="flex flex-col gap-2 text-sm">
                {relacionados.data!.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <Link to={`/ventas/comprobantes/${r.id}`} className="text-acento-700 hover:underline">{TIPOS_DOCUMENTO[r.tipo_documento]} {r.numero_completo ?? ''}</Link>
                    <EstadoSunatBadge estado={r.sunat_estado} />
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}
        </div>
      </div>
      {dialogo === 'nc' && <FormNotaCredito comprobante={d} onCerrar={() => setDialogo(null)} onGuardado={refrescar} />}
      {dialogo === 'nd' && <FormNotaDebito comprobante={d} onCerrar={() => setDialogo(null)} onGuardado={refrescar} />}
      {dialogo === 'anular' && <FormAnular comprobante={d} onCerrar={() => setDialogo(null)} onGuardado={refrescar} />}
      {dialogo === 'guia' && d.venta_id && <FormGuia ventaId={d.venta_id} destinatario={{ tipo_doc: d.cliente_tipo_doc === '6' ? '6' : '1', num_doc: d.cliente_num_doc, razon_social: d.cliente_razon_social }} onCerrar={() => setDialogo(null)} onGuardado={refrescar} />}
    </>
  )
}

function FormNotaCredito({ comprobante, onCerrar, onGuardado }: { comprobante: Detalle; onCerrar: () => void; onGuardado: () => void }) {
  const motivos = useQuery({ queryKey: ['motivos'], queryFn: () => api.get<{ nota_credito: Record<string, string> }>('/documentos/motivos'), staleTime: Infinity })
  const venta = useQuery({ queryKey: ['venta', comprobante.venta_id], queryFn: () => api.get<{ items: VentaItem[] }>(`/ventas/${comprobante.venta_id}`), enabled: Boolean(comprobante.venta_id) })
  const [motivo, setMotivo] = useState('01')
  const [descripcion, setDescripcion] = useState('')
  const [cantidades, setCantidades] = useState<Record<number, number>>({})
  const [reponer, setReponer] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const total = ['01', '02', '06'].includes(motivo)
  const items = comprobante.venta_id
    ? (venta.data?.items ?? []).map((i) => ({ clave: i.id, descripcion: i.descripcion, max: i.cantidad - i.cantidad_devuelta, precio: i.precio_unitario }))
    : (comprobante.payload.items ?? []).map((i, k) => ({ clave: k, descripcion: i.descripcion, max: i.cantidad, precio: i.precio_unitario }))
  const importe = total ? null : items.reduce((s, i) => s + (cantidades[i.clave] ?? 0) * i.precio, 0)

  const emitir = async () => {
    setEnviando(true)
    try {
      const elegidos = Object.entries(cantidades).filter(([, c]) => c > 0)
      await api.post(`/comprobantes/${comprobante.id}/nota-credito`, {
        cod_motivo: motivo,
        des_motivo: descripcion || null,
        reponer_stock: Boolean(comprobante.venta_id) && reponer,
        items: total ? undefined : elegidos.map(([k, c]) => (comprobante.venta_id ? { venta_item_id: Number(k), cantidad: c } : { indice: Number(k), cantidad: c })),
      })
      toast.success('Nota de crédito emitida. El stock se repone cuando SUNAT la acepte.')
      onGuardado()
      onCerrar()
    } catch (e) {
      toast.error(mensajeError(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialogo abierto titulo={`Nota de crédito sobre ${comprobante.numero_completo}`} onCerrar={onCerrar} ancho="max-w-2xl">
      <div className="flex flex-col gap-4">
        <Campo etiqueta="Motivo (catálogo 09)">
          <Selector value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            {Object.entries(motivos.data?.nota_credito ?? {}).map(([k, v]) => <option key={k} value={k}>{k} · {v}</option>)}
          </Selector>
        </Campo>
        <Campo etiqueta="Detalle del motivo (opcional)"><Entrada value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={250} /></Campo>
        {total ? (
          <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">Se acredita todo lo que queda del comprobante.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((i) => (
              <div key={i.clave} className="grid grid-cols-[1fr_6rem_6rem] items-center gap-2 text-sm">
                <span className="truncate">{i.descripcion}</span>
                <span className="text-right text-slate-500">máx. {i.max}</span>
                <Entrada type="number" min="0" max={i.max} step="any" value={cantidades[i.clave] ?? ''} onChange={(e) => setCantidades({ ...cantidades, [i.clave]: Number(e.target.value) })} aria-label={`Cantidad ${i.descripcion}`} />
              </div>
            ))}
            <p className="text-right text-sm font-medium">Importe: {soles(importe ?? 0, comprobante.moneda)}</p>
          </div>
        )}
        {comprobante.venta_id && (
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-acento-600" checked={reponer} onChange={(e) => setReponer(e.target.checked)} /> Reponer stock de lo devuelto (al ser aceptada)</label>
        )}
        <Boton onClick={emitir} cargando={enviando} disabled={!total && !importe} className="self-start">Emitir nota de crédito</Boton>
      </div>
    </Dialogo>
  )
}

function FormNotaDebito({ comprobante, onCerrar, onGuardado }: { comprobante: Detalle; onCerrar: () => void; onGuardado: () => void }) {
  const motivos = useQuery({ queryKey: ['motivos'], queryFn: () => api.get<{ nota_debito: Record<string, string> }>('/documentos/motivos'), staleTime: Infinity })
  const [motivo, setMotivo] = useState('01')
  const [descripcion, setDescripcion] = useState('Intereses por mora')
  const [monto, setMonto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const emitir = async () => {
    setEnviando(true)
    try {
      await api.post(`/comprobantes/${comprobante.id}/nota-debito`, { cod_motivo: motivo, items: [{ descripcion, cantidad: 1, precio_unitario: Number(monto) }] })
      toast.success('Nota de débito emitida.')
      onGuardado()
      onCerrar()
    } catch (e) {
      toast.error(mensajeError(e))
    } finally {
      setEnviando(false)
    }
  }
  return (
    <Dialogo abierto titulo={`Nota de débito sobre ${comprobante.numero_completo}`} onCerrar={onCerrar}>
      <div className="flex flex-col gap-4">
        <Campo etiqueta="Motivo (catálogo 10)"><Selector value={motivo} onChange={(e) => setMotivo(e.target.value)}>{Object.entries(motivos.data?.nota_debito ?? {}).map(([k, v]) => <option key={k} value={k}>{k} · {v}</option>)}</Selector></Campo>
        <Campo etiqueta="Concepto"><Entrada value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></Campo>
        <Campo etiqueta="Monto (con IGV)"><Entrada type="number" step="0.01" min="0" value={monto} onChange={(e) => setMonto(e.target.value)} /></Campo>
        <Boton onClick={emitir} cargando={enviando} disabled={!Number(monto) || descripcion.length < 2} className="self-start">Emitir nota de débito</Boton>
      </div>
    </Dialogo>
  )
}

function FormAnular({ comprobante, onCerrar, onGuardado }: { comprobante: Detalle; onCerrar: () => void; onGuardado: () => void }) {
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const esBoleta = comprobante.tipo_documento === '03'
  const anular = async () => {
    setEnviando(true)
    try {
      await api.post('/anulaciones', { comprobante_ids: [comprobante.id], motivo })
      toast.success('Solicitud enviada a SUNAT. El estado se actualizará solo.')
      onGuardado()
      onCerrar()
    } catch (e) {
      toast.error(mensajeError(e))
    } finally {
      setEnviando(false)
    }
  }
  return (
    <Dialogo abierto titulo={`Anular ${comprobante.numero_completo}`} onCerrar={onCerrar}>
      <div className="flex flex-col gap-4">
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          {esBoleta ? 'Las boletas se anulan con un Resumen Diario.' : 'Se enviará una Comunicación de Baja.'} Solo dentro de los 7 días de emitido. Al ser aceptada, la venta se revierte y el stock vuelve al almacén.
        </p>
        <Campo etiqueta="Motivo"><Entrada value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={255} autoFocus /></Campo>
        <Boton variante="peligro" onClick={anular} cargando={enviando} disabled={motivo.trim().length < 3} className="self-start">Anular comprobante</Boton>
      </div>
    </Dialogo>
  )
}
