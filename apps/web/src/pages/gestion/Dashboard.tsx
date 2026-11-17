import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CircleAlert, TriangleAlert, WifiOff, XCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { hoy, inicioMes } from '@/lib/tipos'
import { soles } from '@/lib/utils'
import { Kpi, Rango } from '@/components/comunes'
import { Cargando, Encabezado, Tarjeta } from '@/components/ui'

interface Datos {
  ventas: { total: number; cantidad: number; ticket_promedio: number; notas_credito: number }
  utilidad: { base: number; costo: number; bruta: number; margen: number }
  compras: { total: number }
  por_cobrar: { saldo: number; vencido: number }
  por_pagar: { saldo: number; vencido: number }
  sunat: { rechazados: number; sin_conexion: number; pendientes_1h: number; anulando: number }
  ventas_por_dia: Array<{ fecha: string; total: number; cantidad: number }>
  top_productos: Array<{ producto_id: number; descripcion: string; cantidad: number; base: number }>
  top_clientes: Array<{ num_doc: string; razon_social: string; total: number; compras: number }>
  productos_bajo_minimo: number
}

export function Dashboard() {
  const [desde, setDesde] = useState(inicioMes())
  const [hasta, setHasta] = useState(hoy())
  const { data, isLoading } = useQuery({ queryKey: ['dashboard', desde, hasta], queryFn: () => api.get<Datos>(`/dashboard?desde=${desde}&hasta=${hasta}`) })

  return (
    <>
      <Encabezado titulo="Dashboard" acciones={<Rango desde={desde} hasta={hasta} onCambio={(d, h) => (setDesde(d), setHasta(h))} />} />
      {isLoading || !data ? <Cargando /> : (
        <div className="flex flex-col gap-5">
          <Alertas datos={data} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi titulo="Ventas" valor={soles(data.ventas.total)} detalle={`${data.ventas.cantidad} operaciones · ticket ${soles(data.ventas.ticket_promedio)}`} />
            <Kpi titulo="Utilidad bruta" valor={soles(data.utilidad.bruta)} detalle={`Margen ${data.utilidad.margen}% sobre ${soles(data.utilidad.base)} sin IGV`} />
            <Kpi titulo="Por cobrar" valor={soles(data.por_cobrar.saldo)} detalle={data.por_cobrar.vencido > 0 ? `${soles(data.por_cobrar.vencido)} vencido` : 'Sin vencidos'} tono={data.por_cobrar.vencido > 0 ? 'alerta' : undefined} />
            <Kpi titulo="Por pagar" valor={soles(data.por_pagar.saldo)} detalle={`Compras del periodo ${soles(data.compras.total)}`} />
          </div>
          <Tarjeta titulo="Ventas por día" descripcion={data.ventas.notas_credito > 0 ? `Notas de crédito del periodo: ${soles(data.ventas.notas_credito)}` : undefined}>
            <BarrasDia datos={data.ventas_por_dia} />
          </Tarjeta>
          <div className="grid gap-5 lg:grid-cols-2">
            <Tarjeta titulo="Productos más vendidos" descripcion="Por venta neta sin IGV">
              <ListaRanking filas={data.top_productos.map((p) => ({ clave: p.producto_id, nombre: p.descripcion, detalle: `${p.cantidad} und.`, valor: p.base }))} />
            </Tarjeta>
            <Tarjeta titulo="Mejores clientes">
              <ListaRanking filas={data.top_clientes.map((c) => ({ clave: c.num_doc, nombre: c.razon_social, detalle: `${c.compras} compras`, valor: c.total }))} />
            </Tarjeta>
          </div>
        </div>
      )}
    </>
  )
}

function Alertas({ datos }: { datos: Datos }) {
  const items = [
    { n: datos.sunat.rechazados, texto: 'comprobantes rechazados por SUNAT', icono: XCircle, clase: 'border-rose-200 bg-rose-50 text-rose-800', a: '/ventas/comprobantes' },
    { n: datos.sunat.sin_conexion, texto: 'comprobantes sin enviar (sin conexión)', icono: WifiOff, clase: 'border-orange-200 bg-orange-50 text-orange-800', a: '/ventas/comprobantes' },
    { n: datos.sunat.pendientes_1h, texto: 'comprobantes pendientes hace más de 1 hora', icono: CircleAlert, clase: 'border-amber-200 bg-amber-50 text-amber-800', a: '/ventas/comprobantes' },
    { n: datos.productos_bajo_minimo, texto: 'productos con stock bajo el mínimo', icono: TriangleAlert, clase: 'border-amber-200 bg-amber-50 text-amber-800', a: '/inventario' },
  ].filter((i) => i.n > 0)
  if (items.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      {items.map((i) => (
        <Link key={i.texto} to={i.a} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${i.clase}`}>
          <i.icono className="size-4 shrink-0" aria-hidden /> <b>{i.n}</b> {i.texto}
        </Link>
      ))}
    </div>
  )
}

/** Barras de una sola serie (el título la nombra): tooltip por barra y tabla accesible. */
function BarrasDia({ datos }: { datos: Datos['ventas_por_dia'] }) {
  const [activo, setActivo] = useState<number | null>(null)
  if (datos.length === 0) return <p className="py-8 text-center text-sm text-slate-500">Sin ventas en el periodo.</p>
  const max = Math.max(...datos.map((d) => d.total))
  const etiquetaFecha = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })
  return (
    <figure>
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-slate-200" />
        <span className="absolute -top-2 right-0 bg-white pl-1 text-[11px] text-slate-400">{soles(max)}</span>
        <div className="flex h-48 items-end gap-0.5 border-b border-slate-200 pt-3" role="img" aria-label="Ventas por día">
          {datos.map((d, i) => (
            <div key={d.fecha} className="relative flex h-full flex-1 items-end justify-center" onMouseEnter={() => setActivo(i)} onMouseLeave={() => setActivo(null)}>
              <div className="w-full max-w-8 rounded-t bg-acento-600 transition-opacity" style={{ height: `${Math.max((d.total / max) * 100, 1)}%`, opacity: activo === null || activo === i ? 1 : 0.45 }} />
              {activo === i && (
                <div className="absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 py-1 text-xs">
                  <p className="font-medium">{etiquetaFecha(d.fecha)}</p>
                  <p className="tabular-nums">{soles(d.total)} · {d.cantidad} ventas</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-500">
        <span>{etiquetaFecha(datos[0].fecha)}</span>
        {datos.length > 1 && <span>{etiquetaFecha(datos.at(-1)!.fecha)}</span>}
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-slate-500">Ver como tabla</summary>
        <table className="mt-2 w-full text-left text-sm">
          <thead><tr className="text-xs text-slate-500"><th>Fecha</th><th className="text-right">Ventas</th><th className="text-right">Total</th></tr></thead>
          <tbody>{datos.map((d) => <tr key={d.fecha}><td>{d.fecha}</td><td className="text-right">{d.cantidad}</td><td className="text-right tabular-nums">{soles(d.total)}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  )
}

function ListaRanking({ filas }: { filas: Array<{ clave: string | number; nombre: string; detalle: string; valor: number }> }) {
  if (filas.length === 0) return <p className="text-sm text-slate-500">Sin datos en el periodo.</p>
  const max = Math.max(...filas.map((f) => f.valor))
  return (
    <ol className="flex flex-col gap-3">
      {filas.map((f) => (
        <li key={f.clave} className="text-sm">
          <div className="flex justify-between gap-2"><span className="truncate">{f.nombre}</span><span className="tabular-nums">{soles(f.valor)}</span></div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-acento-600" style={{ width: `${(f.valor / max) * 100}%` }} /></div>
            <span className="w-20 text-right text-xs text-slate-500">{f.detalle}</span>
          </div>
        </li>
      ))}
    </ol>
  )
}
