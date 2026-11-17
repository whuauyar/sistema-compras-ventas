import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDownCircle, ArrowUpCircle, Lock, LockOpen } from 'lucide-react'
import { toast } from 'sonner'
import { api, mensajeError } from '@/lib/api'
import { METODOS_PAGO, type Caja as CajaT, type Paginado } from '@/lib/tipos'
import { cn, fecha, soles } from '@/lib/utils'
import { Kpi } from '@/components/comunes'
import { Boton, Campo, Cargando, Dialogo, Encabezado, Entrada, Insignia, Tabla, Tarjeta } from '@/components/ui'

interface Detalle {
  id: number
  caja: { nombre: string }
  abierta_en: string
  monto_inicial: number
  estado: 'abierta' | 'cerrada'
  efectivo_esperado: number
  monto_declarado: number | null
  diferencia: number | null
  por_metodo: Record<string, { ingresos: number; egresos: number }>
  movimientos: Array<{ id: number; tipo: 'ingreso' | 'egreso'; concepto: string; metodo: string; monto: number; created_at: string }>
}

export function Caja() {
  const qc = useQueryClient()
  const cajas = useQuery({ queryKey: ['cajas'], queryFn: () => api.get<CajaT[]>('/cajas') })
  const historial = useQuery({ queryKey: ['aperturas'], queryFn: () => api.get<Paginado<Detalle & { monto_esperado: number }>>('/cajas/aperturas') })
  const [abrir, setAbrir] = useState<CajaT | null>(null)
  const [verId, setVerId] = useState<number | null>(null)
  const refrescar = () => (qc.invalidateQueries({ queryKey: ['cajas'] }), qc.invalidateQueries({ queryKey: ['aperturas'] }), qc.invalidateQueries({ queryKey: ['apertura'] }))

  return (
    <>
      <Encabezado titulo="Caja" descripcion="Apertura, movimientos de efectivo y cierre con arqueo." />
      {cajas.isLoading ? <Cargando /> : (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cajas.data?.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
              <div>
                <p className="font-medium">{c.nombre}</p>
                {c.apertura ? <p className="text-xs text-emerald-700">Abierta desde {new Date(c.apertura.abierta_en).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</p> : <p className="text-xs text-slate-500">Cerrada</p>}
              </div>
              {c.apertura ? <Boton variante="secundario" onClick={() => setVerId(c.apertura!.id)}>Ver / cerrar</Boton> : <Boton onClick={() => setAbrir(c)}><LockOpen className="size-4" /> Abrir</Boton>}
            </div>
          ))}
        </div>
      )}
      {verId && <DetalleApertura id={verId} onCambio={refrescar} />}
      <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-700">Historial</h2>
      <Tabla>
        <thead><tr><th>Caja</th><th>Apertura</th><th className="text-right">Esperado</th><th className="text-right">Declarado</th><th className="text-right">Diferencia</th><th>Estado</th></tr></thead>
        <tbody>
          {historial.data?.data.map((a) => (
            <tr key={a.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setVerId(a.id)}>
              <td>{a.caja.nombre}</td>
              <td>{fecha(a.abierta_en)}</td>
              <td className="text-right tabular-nums">{a.monto_esperado != null ? soles(a.monto_esperado) : '—'}</td>
              <td className="text-right tabular-nums">{a.monto_declarado != null ? soles(a.monto_declarado) : '—'}</td>
              <td className={cn('text-right tabular-nums', (a.diferencia ?? 0) < 0 && 'text-rose-600')}>{a.diferencia != null ? soles(a.diferencia) : '—'}</td>
              <td><Insignia className={a.estado === 'abierta' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}>{a.estado}</Insignia></td>
            </tr>
          ))}
        </tbody>
      </Tabla>
      {abrir && (
        <AbrirCaja caja={abrir} onCerrar={() => setAbrir(null)} onAbierta={(id) => (refrescar(), setVerId(id))} />
      )}
    </>
  )
}

function AbrirCaja({ caja, onCerrar, onAbierta }: { caja: CajaT; onCerrar: () => void; onAbierta: (id: number) => void }) {
  const [monto, setMonto] = useState('0')
  const abrir = async () => {
    try {
      const a = await api.post<{ id: number }>('/cajas/aperturas', { caja_id: caja.id, monto_inicial: Number(monto) })
      toast.success('Caja abierta.')
      onAbierta(a.id)
      onCerrar()
    } catch (e) {
      toast.error(mensajeError(e))
    }
  }
  return (
    <Dialogo abierto titulo={`Abrir ${caja.nombre}`} onCerrar={onCerrar}>
      <Campo etiqueta="Efectivo inicial (sencillo)"><Entrada type="number" step="0.01" min="0" value={monto} onChange={(e) => setMonto(e.target.value)} autoFocus /></Campo>
      <Boton className="mt-4" onClick={abrir}>Abrir caja</Boton>
    </Dialogo>
  )
}

function DetalleApertura({ id, onCambio }: { id: number; onCambio: () => void }) {
  const { data, refetch } = useQuery({ queryKey: ['apertura', id], queryFn: () => api.get<Detalle>(`/cajas/aperturas/${id}`) })
  const [mov, setMov] = useState<'ingreso' | 'egreso' | null>(null)
  const [cerrar, setCerrar] = useState(false)
  if (!data) return <Cargando />
  const abierta = data.estado === 'abierta'
  return (
    <Tarjeta
      className="mb-6"
      titulo={`${data.caja.nombre} · ${abierta ? 'abierta' : 'cerrada'}`}
      descripcion={`Desde ${new Date(data.abierta_en).toLocaleString('es-PE')}`}
      acciones={abierta && (
        <div className="flex flex-wrap gap-2">
          <Boton variante="secundario" onClick={() => setMov('ingreso')}><ArrowDownCircle className="size-4" /> Ingreso</Boton>
          <Boton variante="secundario" onClick={() => setMov('egreso')}><ArrowUpCircle className="size-4" /> Egreso</Boton>
          <Boton onClick={() => setCerrar(true)}><Lock className="size-4" /> Cerrar caja</Boton>
        </div>
      )}
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Kpi titulo="Efectivo inicial" valor={soles(data.monto_inicial)} />
        <Kpi titulo="Efectivo esperado" valor={soles(data.efectivo_esperado)} />
        {Object.entries(data.por_metodo).filter(([m]) => m !== 'efectivo').map(([m, v]) => (
          <Kpi key={m} titulo={METODOS_PAGO.find((x) => x.valor === m)?.etiqueta ?? m} valor={soles(v.ingresos - v.egresos)} />
        ))}
        {!abierta && <Kpi titulo="Diferencia" valor={soles(data.diferencia ?? 0)} tono={(data.diferencia ?? 0) < 0 ? 'alerta' : 'ok'} />}
      </div>
      <Tabla>
        <thead><tr><th>Hora</th><th>Concepto</th><th>Método</th><th className="text-right">Monto</th></tr></thead>
        <tbody>
          {data.movimientos.map((m) => (
            <tr key={m.id}>
              <td className="text-xs">{new Date(m.created_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</td>
              <td>{m.concepto}</td>
              <td>{m.metodo}</td>
              <td className={cn('text-right tabular-nums', m.tipo === 'egreso' ? 'text-rose-600' : 'text-emerald-700')}>{m.tipo === 'egreso' ? '−' : '+'}{soles(m.monto)}</td>
            </tr>
          ))}
        </tbody>
      </Tabla>
      {mov && <Movimiento tipo={mov} aperturaId={id} onCerrar={() => setMov(null)} onGuardado={() => (refetch(), onCambio())} />}
      {cerrar && <Cierre aperturaId={id} esperado={data.efectivo_esperado} onCerrar={() => setCerrar(false)} onGuardado={() => (refetch(), onCambio())} />}
    </Tarjeta>
  )
}

function Movimiento({ tipo, aperturaId, onCerrar, onGuardado }: { tipo: 'ingreso' | 'egreso'; aperturaId: number; onCerrar: () => void; onGuardado: () => void }) {
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState('')
  const guardar = async () => {
    try {
      await api.post(`/cajas/aperturas/${aperturaId}/movimientos`, { tipo, concepto, monto: Number(monto) })
      onGuardado()
      onCerrar()
    } catch (e) {
      toast.error(mensajeError(e))
    }
  }
  return (
    <Dialogo abierto titulo={tipo === 'ingreso' ? 'Ingreso de efectivo' : 'Egreso de efectivo'} onCerrar={onCerrar}>
      <div className="flex flex-col gap-4">
        <Campo etiqueta="Concepto"><Entrada value={concepto} onChange={(e) => setConcepto(e.target.value)} autoFocus /></Campo>
        <Campo etiqueta="Monto"><Entrada type="number" step="0.01" min="0" value={monto} onChange={(e) => setMonto(e.target.value)} /></Campo>
        <Boton onClick={guardar} disabled={concepto.length < 3 || !Number(monto)} className="self-start">Registrar</Boton>
      </div>
    </Dialogo>
  )
}

function Cierre({ aperturaId, esperado, onCerrar, onGuardado }: { aperturaId: number; esperado: number; onCerrar: () => void; onGuardado: () => void }) {
  const [contado, setContado] = useState('')
  const [observacion, setObservacion] = useState('')
  const diferencia = Number(contado || 0) - esperado
  const guardar = async () => {
    try {
      await api.post(`/cajas/aperturas/${aperturaId}/cerrar`, { monto_declarado: Number(contado), observacion: observacion || null })
      toast.success('Caja cerrada.')
      onGuardado()
      onCerrar()
    } catch (e) {
      toast.error(mensajeError(e))
    }
  }
  return (
    <Dialogo abierto titulo="Cerrar caja (arqueo)" onCerrar={onCerrar}>
      <div className="flex flex-col gap-4">
        <p className="text-sm">Efectivo esperado: <b>{soles(esperado)}</b></p>
        <Campo etiqueta="Efectivo contado"><Entrada type="number" step="0.01" min="0" value={contado} onChange={(e) => setContado(e.target.value)} autoFocus /></Campo>
        {contado !== '' && <p className={cn('text-sm font-medium', diferencia < 0 ? 'text-rose-600' : diferencia > 0 ? 'text-amber-700' : 'text-emerald-700')}>{diferencia === 0 ? 'Cuadra exacto' : `${diferencia < 0 ? 'Faltante' : 'Sobrante'}: ${soles(Math.abs(diferencia))}`}</p>}
        <Campo etiqueta="Observación"><Entrada value={observacion} onChange={(e) => setObservacion(e.target.value)} /></Campo>
        <Boton onClick={guardar} disabled={contado === ''} className="self-start">Cerrar caja</Boton>
      </div>
    </Dialogo>
  )
}
