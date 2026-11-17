import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { HandCoins, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { api, mensajeError } from '@/lib/api'
import { ESTADO_CUOTA, METODOS_PAGO, type Caja, type Paginado } from '@/lib/tipos'
import { cn, fecha, soles } from '@/lib/utils'
import { Kpi, Paginacion } from '@/components/comunes'
import { Boton, Campo, Cargando, Dialogo, Encabezado, Entrada, Insignia, Selector, Tabla, Vacio } from '@/components/ui'

interface Cuota {
  id: number
  numero_cuota: number
  fecha_vencimiento: string
  moneda: string
  monto: number
  saldo: number
  estado: string
  proveedor?: { razon_social: string }
  compra?: { serie: string; numero: string }
  venta?: { id: number; cliente_razon_social: string; comprobante?: { numero_completo: string | null } | null }
}

/** Cuentas por cobrar (clientes) o por pagar (proveedores). */
export function Cuentas({ tipo }: { tipo: 'cobrar' | 'pagar' }) {
  const qc = useQueryClient()
  const [estado, setEstado] = useState('pendiente,parcial')
  const [pagina, setPagina] = useState(1)
  const [pagando, setPagando] = useState<Cuota | null>(null)
  const ruta = tipo === 'cobrar' ? '/cuentas-por-cobrar' : '/cuentas-por-pagar'
  const lista = useQuery({
    queryKey: ['cuentas', tipo, estado, pagina],
    queryFn: () => api.get<Paginado<Cuota> & { resumen: Array<{ moneda: string; saldo: number; vencido: number }> }>(`${ruta}?estado=${estado}&pagina=${pagina}`),
  })
  const hoyIso = new Date().toISOString().slice(0, 10)
  const pen = lista.data?.resumen.find((r) => r.moneda === 'PEN')

  return (
    <>
      <Encabezado titulo={tipo === 'cobrar' ? 'Cuentas por cobrar' : 'Cuentas por pagar'} descripcion={tipo === 'cobrar' ? 'Cuotas de ventas al crédito.' : 'Cuotas de compras al crédito.'} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Kpi titulo="Saldo pendiente" valor={soles(pen?.saldo ?? 0)} />
        <Kpi titulo="Vencido" valor={soles(pen?.vencido ?? 0)} tono={(pen?.vencido ?? 0) > 0 ? 'alerta' : undefined} />
        <Selector className="self-end" value={estado} onChange={(e) => (setEstado(e.target.value), setPagina(1))} aria-label="Estado">
          <option value="pendiente,parcial">Pendientes</option><option value="pagada">Pagadas</option><option value="anulada">Anuladas</option>
        </Selector>
      </div>
      {lista.isLoading ? <Cargando /> : !lista.data?.data.length ? (
        <Vacio icono={<Wallet className="size-8" />} titulo="Sin cuotas" />
      ) : (
        <>
          <Tabla>
            <thead><tr><th>{tipo === 'cobrar' ? 'Cliente' : 'Proveedor'}</th><th>Documento</th><th>Cuota</th><th>Vence</th><th className="text-right">Monto</th><th className="text-right">Saldo</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {lista.data.data.map((c) => {
                const vencida = c.saldo > 0 && c.fecha_vencimiento.slice(0, 10) < hoyIso
                return (
                  <tr key={c.id}>
                    <td className="max-w-[14rem] truncate">{tipo === 'cobrar' ? c.venta?.cliente_razon_social : c.proveedor?.razon_social}</td>
                    <td className="font-mono text-xs">{tipo === 'cobrar' ? (c.venta?.comprobante?.numero_completo ?? `V-${c.venta?.id}`) : `${c.compra?.serie}-${c.compra?.numero}`}</td>
                    <td>{c.numero_cuota}</td>
                    <td className={cn(vencida && 'font-medium text-rose-600')}>{fecha(c.fecha_vencimiento)}</td>
                    <td className="text-right tabular-nums">{soles(c.monto, c.moneda)}</td>
                    <td className="text-right font-medium tabular-nums">{soles(c.saldo, c.moneda)}</td>
                    <td><Insignia className={ESTADO_CUOTA[c.estado]}>{c.estado}</Insignia></td>
                    <td className="text-right">{c.saldo > 0 && <Boton variante="secundario" tamano="sm" onClick={() => setPagando(c)}><HandCoins className="size-3.5" /> {tipo === 'cobrar' ? 'Cobrar' : 'Pagar'}</Boton>}</td>
                  </tr>
                )
              })}
            </tbody>
          </Tabla>
          <Paginacion meta={lista.data.meta} pagina={pagina} onCambio={setPagina} />
        </>
      )}
      {pagando && <FormPago tipo={tipo} cuota={pagando} onCerrar={() => setPagando(null)} onGuardado={() => qc.invalidateQueries({ queryKey: ['cuentas'] })} />}
    </>
  )
}

function FormPago({ tipo, cuota, onCerrar, onGuardado }: { tipo: 'cobrar' | 'pagar'; cuota: Cuota; onCerrar: () => void; onGuardado: () => void }) {
  const cajas = useQuery({ queryKey: ['cajas'], queryFn: () => api.get<Caja[]>('/cajas'), enabled: tipo === 'cobrar' })
  const abiertas = (cajas.data ?? []).filter((c) => c.apertura)
  const [monto, setMonto] = useState(String(cuota.saldo))
  const [metodo, setMetodo] = useState('efectivo')
  const [referencia, setReferencia] = useState('')
  const [cajaId, setCajaId] = useState('')
  const [guardando, setGuardando] = useState(false)
  const guardar = async () => {
    setGuardando(true)
    try {
      const ruta = tipo === 'cobrar' ? `/cuentas-por-cobrar/${cuota.id}/cobros` : `/cuentas-por-pagar/${cuota.id}/pagos`
      await api.post(ruta, { monto: Number(monto), metodo, referencia: referencia || null, caja_id: tipo === 'cobrar' && cajaId ? Number(cajaId) : undefined })
      toast.success(tipo === 'cobrar' ? 'Cobro registrado.' : 'Pago registrado.')
      onGuardado()
      onCerrar()
    } catch (e) {
      toast.error(mensajeError(e))
    } finally {
      setGuardando(false)
    }
  }
  return (
    <Dialogo abierto titulo={`${tipo === 'cobrar' ? 'Cobrar' : 'Pagar'} cuota ${cuota.numero_cuota}`} onCerrar={onCerrar}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-600">Saldo: <b>{soles(cuota.saldo, cuota.moneda)}</b></p>
        <Campo etiqueta="Monto"><Entrada type="number" step="0.01" min="0" max={cuota.saldo} value={monto} onChange={(e) => setMonto(e.target.value)} /></Campo>
        <Campo etiqueta="Método"><Selector value={metodo} onChange={(e) => setMetodo(e.target.value)}>{METODOS_PAGO.map((m) => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}</Selector></Campo>
        {tipo === 'cobrar' && abiertas.length > 0 && (
          <Campo etiqueta="Ingresar a caja"><Selector value={cajaId} onChange={(e) => setCajaId(e.target.value)}><option value="">No registrar en caja</option>{abiertas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Selector></Campo>
        )}
        <Campo etiqueta="Referencia (n.º operación)"><Entrada value={referencia} onChange={(e) => setReferencia(e.target.value)} /></Campo>
        <Boton onClick={guardar} cargando={guardando} className="self-start">Registrar</Boton>
      </div>
    </Dialogo>
  )
}
