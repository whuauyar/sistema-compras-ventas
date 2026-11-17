import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { api } from '@/lib/api'
import { hoy, inicioMes, type Almacen, type Producto } from '@/lib/tipos'
import { soles } from '@/lib/utils'
import { BuscadorProducto, Rango } from '@/components/comunes'
import { Boton, Cargando, Encabezado, Selector, Tabla, Vacio } from '@/components/ui'
import { descargarCsv } from '@/lib/descargas'

interface Reporte {
  titulo: string
  columnas: Array<{ clave: string; titulo: string; tipo?: 'texto' | 'numero' | 'moneda' | 'fecha' }>
  filas: Array<Record<string, unknown>>
}

const REPORTES: Record<string, { nombre: string; agrupar?: Record<string, string> }> = {
  ventas: { nombre: 'Ventas', agrupar: { dia: 'Por día', producto: 'Por producto', cliente: 'Por cliente', vendedor: 'Por vendedor', sucursal: 'Por sucursal', metodo_pago: 'Por método de pago' } },
  utilidad: { nombre: 'Utilidad por producto' },
  compras: { nombre: 'Compras', agrupar: { dia: 'Por día', proveedor: 'Por proveedor', producto: 'Por producto' } },
  inventario: { nombre: 'Inventario valorizado' },
  kardex: { nombre: 'Kardex de producto' },
  'registro-ventas': { nombre: 'Registro de ventas' },
}

export function Reportes() {
  const [tipo, setTipo] = useState('ventas')
  const [agrupar, setAgrupar] = useState('dia')
  const [desde, setDesde] = useState(inicioMes())
  const [hasta, setHasta] = useState(hoy())
  const [almacenId, setAlmacenId] = useState('')
  const [producto, setProducto] = useState<Producto | null>(null)
  const almacenes = useQuery({ queryKey: ['almacenes'], queryFn: () => api.get<Almacen[]>('/almacenes') })
  const def = REPORTES[tipo]

  const params = new URLSearchParams({ desde, hasta })
  if (def.agrupar) params.set('agrupar', agrupar)
  if (almacenId && ['inventario', 'kardex'].includes(tipo)) params.set('almacen_id', almacenId)
  if (tipo === 'kardex' && producto) params.set('producto_id', String(producto.id))
  const listo = tipo !== 'kardex' || Boolean(producto)
  const reporte = useQuery({ queryKey: ['reporte', tipo, params.toString()], queryFn: () => api.get<Reporte>(`/reportes/${tipo}?${params}`), enabled: listo })

  const formato = (v: unknown, t?: string) => (v === null || v === undefined || v === '' ? '' : t === 'moneda' ? soles(Number(v)) : t === 'numero' ? Number(v).toLocaleString('es-PE') : String(v))
  const totales = reporte.data?.columnas.filter((c) => c.tipo === 'moneda' && !['costo_promedio', 'costo_unitario', 'saldo_costo_promedio', 'saldo_valor'].includes(c.clave))

  return (
    <>
      <Encabezado titulo="Reportes" acciones={listo && <Boton variante="secundario" onClick={() => descargarCsv(`/reportes/${tipo}?${params}&formato=csv`)}><Download className="size-4" /> Exportar a Excel (CSV)</Boton>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Selector className="w-56" value={tipo} onChange={(e) => (setTipo(e.target.value), setAgrupar('dia'))} aria-label="Reporte">
          {Object.entries(REPORTES).map(([k, r]) => <option key={k} value={k}>{r.nombre}</option>)}
        </Selector>
        {def.agrupar && <Selector className="w-48" value={agrupar} onChange={(e) => setAgrupar(e.target.value)} aria-label="Agrupar">{Object.entries(def.agrupar).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Selector>}
        {['inventario', 'kardex'].includes(tipo) && (
          <Selector className="w-48" value={almacenId} onChange={(e) => setAlmacenId(e.target.value)} aria-label="Almacén"><option value="">Todos los almacenes</option>{almacenes.data?.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Selector>
        )}
        {tipo !== 'inventario' && <Rango desde={desde} hasta={hasta} onCambio={(d, h) => (setDesde(d), setHasta(h))} />}
        {tipo === 'kardex' && <div className="w-full max-w-md"><BuscadorProducto onElegir={setProducto} placeholder={producto ? producto.nombre : 'Elegir producto…'} /></div>}
      </div>
      {!listo ? <Vacio icono={<Download className="size-8" />} titulo="Elija un producto" /> : reporte.isLoading ? <Cargando /> : !reporte.data?.filas.length ? (
        <Vacio icono={<Download className="size-8" />} titulo="Sin datos para el filtro" />
      ) : (
        <>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">{reporte.data.titulo} · {reporte.data.filas.length} filas</h2>
          <Tabla>
            <thead><tr>{reporte.data.columnas.map((c) => <th key={c.clave} className={c.tipo === 'moneda' || c.tipo === 'numero' ? 'text-right' : ''}>{c.titulo}</th>)}</tr></thead>
            <tbody>
              {reporte.data.filas.map((f, i) => (
                <tr key={i}>{reporte.data!.columnas.map((c) => <td key={c.clave} className={c.tipo === 'moneda' || c.tipo === 'numero' ? 'text-right tabular-nums' : ''}>{formato(f[c.clave], c.tipo)}</td>)}</tr>
              ))}
              {totales && totales.length > 0 && (
                <tr className="bg-slate-50 font-semibold">
                  {reporte.data.columnas.map((c, i) => (
                    <td key={c.clave} className={c.tipo === 'moneda' ? 'text-right tabular-nums' : ''}>
                      {i === 0 ? 'Total' : totales.some((t) => t.clave === c.clave) ? soles(reporte.data!.filas.reduce((s, f) => s + Number(f[c.clave] ?? 0), 0)) : ''}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </Tabla>
        </>
      )}
    </>
  )
}
