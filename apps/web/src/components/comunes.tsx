import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { api } from '@/lib/api'
import type { Paginado, Producto } from '@/lib/tipos'
import { cn, soles } from '@/lib/utils'
import { Boton, Entrada } from './ui'

/** Paginación simple de listados del backend. */
export function Paginacion({ meta, pagina, onCambio }: { meta?: Paginado<unknown>['meta']; pagina: number; onCambio: (p: number) => void }) {
  if (!meta || meta.last_page <= 1) return null
  return (
    <div className="mt-4 flex items-center justify-end gap-2 text-sm">
      <Boton variante="secundario" tamano="sm" disabled={pagina <= 1} onClick={() => onCambio(pagina - 1)}>Anterior</Boton>
      <span className="text-slate-500">Página {pagina} de {meta.last_page} · {meta.total} registros</span>
      <Boton variante="secundario" tamano="sm" disabled={pagina >= meta.last_page} onClick={() => onCambio(pagina + 1)}>Siguiente</Boton>
    </div>
  )
}

/** Cuadro de búsqueda con espera (debounce) para no consultar en cada tecla. */
export function useDebounce<T>(valor: T, ms = 300) {
  const [v, setV] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return v
}

/**
 * Buscador de productos por código, código de barras o nombre.
 * Enter con un código exacto (lector de barras) agrega directo.
 */
export function BuscadorProducto({ onElegir, placeholder = 'Buscar producto (código, barras o nombre)…', autoFocus }: { onElegir: (p: Producto) => void; placeholder?: string; autoFocus?: boolean }) {
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [indice, setIndice] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const buscar = useDebounce(texto.trim(), 200)
  const { data } = useQuery({
    queryKey: ['productos', 'buscador', buscar],
    queryFn: () => api.get<Paginado<Producto>>(`/productos?estado=activos&por_pagina=8&buscar=${encodeURIComponent(buscar)}`),
    enabled: buscar.length > 0,
  })
  const opciones = data?.data ?? []

  useEffect(() => {
    const cerrar = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setAbierto(false)
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [])

  const elegir = (p: Producto) => {
    onElegir(p)
    setTexto('')
    setAbierto(false)
    setIndice(0)
  }

  return (
    <div ref={ref} className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-slate-400" />
      <Entrada
        autoFocus={autoFocus}
        className="pl-8"
        placeholder={placeholder}
        value={texto}
        onChange={(e) => (setTexto(e.target.value), setAbierto(true), setIndice(0))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setIndice((i) => Math.min(i + 1, opciones.length - 1))
          if (e.key === 'ArrowUp') setIndice((i) => Math.max(i - 1, 0))
          if (e.key === 'Enter') {
            e.preventDefault()
            const exacto = opciones.find((o) => o.codigo === texto.trim().toUpperCase() || o.codigo_barras === texto.trim())
            const elegido = exacto ?? opciones[indice]
            if (elegido) elegir(elegido)
          }
          if (e.key === 'Escape') setAbierto(false)
        }}
      />
      {abierto && buscar && (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 text-sm">
          {opciones.length === 0 && <li className="px-3 py-2 text-slate-500">Sin resultados</li>}
          {opciones.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(p)}
                className={cn('flex w-full items-center justify-between gap-3 px-3 py-2 text-left', i === indice ? 'bg-acento-50' : 'hover:bg-slate-50')}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.nombre}</span>
                  <span className="text-xs text-slate-500">{p.codigo}{p.controla_stock ? ` · stock ${p.stock ?? 0}` : ' · servicio'}</span>
                </span>
                <span className="tabular-nums">{soles(p.precio_venta)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Tarjeta KPI del dashboard. */
export function Kpi({ titulo, valor, detalle, tono }: { titulo: string; valor: ReactNode; detalle?: ReactNode; tono?: 'alerta' | 'ok' }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className={cn('mt-1 text-2xl font-semibold tabular-nums', tono === 'alerta' && 'text-rose-600', tono === 'ok' && 'text-emerald-700')}>{valor}</p>
      {detalle && <p className="mt-0.5 text-xs text-slate-500">{detalle}</p>}
    </div>
  )
}

/** Filtro de rango de fechas reutilizable. */
export function Rango({ desde, hasta, onCambio }: { desde: string; hasta: string; onCambio: (d: string, h: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Entrada type="date" className="w-40" value={desde} onChange={(e) => onCambio(e.target.value, hasta)} aria-label="Desde" />
      <span className="text-slate-400">a</span>
      <Entrada type="date" className="w-40" value={hasta} onChange={(e) => onCambio(desde, e.target.value)} aria-label="Hasta" />
    </div>
  )
}
