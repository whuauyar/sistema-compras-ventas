import { Trash2 } from 'lucide-react'
import type { Producto } from '@/lib/tipos'
import { soles } from '@/lib/utils'
import { BuscadorProducto } from '@/components/comunes'
import { Boton, Entrada } from '@/components/ui'

export interface LineaCompra {
  producto_id: number
  nombre: string
  cantidad: number
  precio_unitario: number
  tip_afe_igv: string
}

/** Ítems de compra / OC con precio CON IGV y total. */
export function LineasCompra({ lineas, setLineas, moneda = 'PEN' }: { lineas: LineaCompra[]; setLineas: (l: LineaCompra[]) => void; moneda?: string }) {
  const total = lineas.reduce((s, l) => s + l.cantidad * l.precio_unitario, 0)
  const agregar = (p: Producto) => {
    if (lineas.some((l) => l.producto_id === p.id)) return
    setLineas([...lineas, { producto_id: p.id, nombre: p.nombre, cantidad: 1, precio_unitario: 0, tip_afe_igv: p.tip_afe_igv }])
  }
  const cambiar = (i: number, cambios: Partial<LineaCompra>) => setLineas(lineas.map((l, j) => (j === i ? { ...l, ...cambios } : l)))
  return (
    <div className="flex flex-col gap-2">
      <BuscadorProducto onElegir={agregar} />
      {lineas.length > 0 && (
        <div className="grid grid-cols-[1fr_6rem_8rem_7rem_auto] gap-2 text-xs font-medium uppercase text-slate-500">
          <span>Producto</span><span>Cantidad</span><span>P. unit. c/IGV</span><span className="text-right">Subtotal</span><span />
        </div>
      )}
      {lineas.map((l, i) => (
        <div key={l.producto_id} className="grid grid-cols-[1fr_6rem_8rem_7rem_auto] items-center gap-2 text-sm">
          <span className="truncate">{l.nombre}</span>
          <Entrada type="number" min="0" step="any" value={l.cantidad} onChange={(e) => cambiar(i, { cantidad: Number(e.target.value) })} aria-label="Cantidad" />
          <Entrada type="number" min="0" step="0.0001" value={l.precio_unitario || ''} onChange={(e) => cambiar(i, { precio_unitario: Number(e.target.value) })} aria-label="Precio" />
          <span className="text-right tabular-nums">{soles(l.cantidad * l.precio_unitario, moneda)}</span>
          <Boton type="button" variante="fantasma" tamano="sm" onClick={() => setLineas(lineas.filter((_, j) => j !== i))} aria-label="Quitar"><Trash2 className="size-3.5" /></Boton>
        </div>
      ))}
      {lineas.length > 0 && <p className="text-right text-sm font-semibold tabular-nums">Total: {soles(total, moneda)}</p>}
    </div>
  )
}
