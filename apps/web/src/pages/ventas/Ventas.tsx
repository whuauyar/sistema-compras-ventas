import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Receipt } from 'lucide-react'
import { api } from '@/lib/api'
import type { Paginado } from '@/lib/tipos'
import type { EstadoSunat } from '@/lib/sunat'
import { fecha, soles } from '@/lib/utils'
import { Paginacion, useDebounce } from '@/components/comunes'
import { EstadoSunatBadge } from '@/components/EstadoSunat'
import { Cargando, Encabezado, Entrada, Insignia, Tabla, Vacio } from '@/components/ui'

interface VentaFila {
  id: number
  fecha: string
  cliente_razon_social: string
  cliente_num_doc: string
  forma_pago: string
  total: number
  costo_total: number
  moneda: string
  estado: string
  comprobante: null | { id: number; numero_completo: string | null; sunat_estado: EstadoSunat; sunat_codigo: string | null; sunat_descripcion: string | null }
}

export function Ventas() {
  const [buscar, setBuscar] = useState('')
  const [pagina, setPagina] = useState(1)
  const b = useDebounce(buscar)
  const lista = useQuery({ queryKey: ['ventas', b, pagina], queryFn: () => api.get<Paginado<VentaFila>>(`/ventas?pagina=${pagina}&buscar=${encodeURIComponent(b)}`) })
  return (
    <>
      <Encabezado titulo="Ventas" descripcion="Cada venta con su comprobante y estado SUNAT." />
      <Entrada className="mb-4 max-w-sm" placeholder="Número, cliente o documento" value={buscar} onChange={(e) => (setBuscar(e.target.value), setPagina(1))} />
      {lista.isLoading ? <Cargando /> : !lista.data?.data.length ? (
        <Vacio icono={<Receipt className="size-8" />} titulo="Sin ventas" />
      ) : (
        <>
          <Tabla>
            <thead><tr><th>Comprobante</th><th className="hidden md:table-cell">Fecha</th><th>Cliente</th><th>Pago</th><th className="text-right">Total</th><th className="hidden text-right md:table-cell">Margen</th><th>SUNAT</th></tr></thead>
            <tbody>
              {lista.data.data.map((v) => {
                const base = v.total / 1.18
                return (
                  <tr key={v.id} className={v.estado === 'anulada' ? 'opacity-60' : ''}>
                    <td>
                      {v.comprobante ? <Link to={`/ventas/comprobantes/${v.comprobante.id}`} className="font-medium text-acento-700 hover:underline">{v.comprobante.numero_completo ?? 'En cola'}</Link> : `V-${v.id}`}
                      {v.estado === 'anulada' && <Insignia className="ml-2 bg-slate-100 text-slate-500 ring-slate-200">anulada</Insignia>}
                    </td>
                    <td className="hidden md:table-cell">{fecha(v.fecha)}</td>
                    <td className="max-w-[14rem] truncate">{v.cliente_razon_social}</td>
                    <td>{v.forma_pago}</td>
                    <td className="text-right tabular-nums">{soles(v.total, v.moneda)}</td>
                    <td className="hidden text-right tabular-nums text-slate-500 md:table-cell">{v.costo_total > 0 ? `${Math.round(((base - v.costo_total) / base) * 100)}%` : '—'}</td>
                    <td>{v.comprobante && <EstadoSunatBadge estado={v.comprobante.sunat_estado} codigo={v.comprobante.sunat_codigo} descripcion={v.comprobante.sunat_descripcion} />}</td>
                  </tr>
                )
              })}
            </tbody>
          </Tabla>
          <Paginacion meta={lista.data.meta} pagina={pagina} onCambio={setPagina} />
        </>
      )}
    </>
  )
}
