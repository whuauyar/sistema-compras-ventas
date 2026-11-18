import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, FileSpreadsheet } from 'lucide-react'
import { api } from '@/lib/api'
import { descargarArchivo } from '@/lib/descargas'
import type { Almacen, Producto } from '@/lib/tipos'
import { inicioMes, hoy } from '@/lib/tipos'
import { soles } from '@/lib/utils'
import { BuscadorProducto, Rango } from '@/components/comunes'
import { Boton, Cargando, Encabezado, Selector, Tabla, Vacio } from '@/components/ui'

interface FilaKardex {
  fecha: string
  almacen: string
  motivo: string
  referencia: string | null
  entrada: number | null
  salida: number | null
  costo_unitario: number
  saldo_cantidad: number
  saldo_costo_promedio: number
  saldo_valor: number
}

const MOTIVOS: Record<string, string> = {
  inventario_inicial: 'Inventario inicial', compra: 'Compra', anulacion_compra: 'Anulación de compra', venta: 'Venta',
  devolucion_venta: 'Devolución (NC)', anulacion_venta: 'Anulación de venta', ajuste_entrada: 'Ajuste (+)', ajuste_salida: 'Ajuste (−)',
  merma: 'Merma', transferencia_entrada: 'Transferencia (+)', transferencia_salida: 'Transferencia (−)',
}

export function Kardex() {
  const [producto, setProducto] = useState<Producto | null>(null)
  const [almacenId, setAlmacenId] = useState('')
  const [desde, setDesde] = useState(inicioMes())
  const [hasta, setHasta] = useState(hoy())
  const almacenes = useQuery({ queryKey: ['almacenes'], queryFn: () => api.get<Almacen[]>('/almacenes') })
  const params = new URLSearchParams({ desde, hasta })
  if (producto) params.set('producto_id', String(producto.id))
  if (almacenId) params.set('almacen_id', almacenId)
  const kardex = useQuery({
    queryKey: ['kardex', params.toString()],
    queryFn: () => api.get<{ filas: FilaKardex[] }>(`/reportes/kardex?${params}`),
    enabled: Boolean(producto),
  })

  return (
    <>
      <Encabezado
        titulo="Kardex valorizado"
        descripcion="Movimientos con costo promedio ponderado."
        acciones={producto && <Boton variante="secundario" onClick={() => descargarArchivo(`/reportes/kardex?${params}&formato=csv`)}><Download className="size-4" /> Exportar CSV</Boton>}
      />
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_14rem_auto]">
        <BuscadorProducto onElegir={setProducto} placeholder={producto ? `${producto.codigo} · ${producto.nombre}` : 'Elegir producto…'} />
        <Selector value={almacenId} onChange={(e) => setAlmacenId(e.target.value)} aria-label="Almacén">
          <option value="">Todos los almacenes</option>
          {almacenes.data?.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </Selector>
        <Rango desde={desde} hasta={hasta} onCambio={(d, h) => (setDesde(d), setHasta(h))} />
      </div>
      {!producto ? (
        <Vacio icono={<FileSpreadsheet className="size-8" />} titulo="Elija un producto" texto="Busque por código, código de barras o nombre." />
      ) : kardex.isLoading ? <Cargando /> : !kardex.data?.filas.length ? (
        <Vacio icono={<FileSpreadsheet className="size-8" />} titulo="Sin movimientos en el periodo" />
      ) : (
        <Tabla>
          <thead><tr><th>Fecha</th><th>Motivo</th><th className="hidden md:table-cell">Documento</th><th className="text-right">Entrada</th><th className="text-right">Salida</th><th className="hidden text-right md:table-cell">Costo unit.</th><th className="text-right">Saldo</th><th className="text-right">Costo prom.</th><th className="text-right">Valor</th></tr></thead>
          <tbody>
            {kardex.data.filas.map((f, i) => (
              <tr key={i}>
                <td className="whitespace-nowrap text-xs">{f.fecha}<p className="text-slate-500">{f.almacen}</p></td>
                <td>{MOTIVOS[f.motivo] ?? f.motivo}</td>
                <td className="hidden font-mono text-xs md:table-cell">{f.referencia}</td>
                <td className="text-right tabular-nums text-emerald-700">{f.entrada ?? ''}</td>
                <td className="text-right tabular-nums text-rose-700">{f.salida ?? ''}</td>
                <td className="hidden text-right tabular-nums md:table-cell">{soles(f.costo_unitario)}</td>
                <td className="text-right font-medium tabular-nums">{f.saldo_cantidad}</td>
                <td className="text-right tabular-nums">{soles(f.saldo_costo_promedio)}</td>
                <td className="text-right tabular-nums">{soles(f.saldo_valor)}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  )
}
