import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Printer } from 'lucide-react'
import { FORMATOS } from '@/lib/sunat'
import { abrirPdf } from '@/lib/pdf'
import { Boton } from './ui'

export function MenuImpresion({ id, deshabilitado }: { id: number; deshabilitado?: boolean }) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const cerrar = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setAbierto(false)
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [])

  return (
    <div ref={ref} className="relative inline-flex">
      <Boton variante="secundario" tamano="sm" className="rounded-r-none" disabled={deshabilitado} onClick={() => abrirPdf(id)} title="Imprimir en el formato predeterminado">
        <Printer className="size-3.5" /> Imprimir
      </Boton>
      <Boton variante="secundario" tamano="sm" className="-ml-px rounded-l-none px-1.5" disabled={deshabilitado} onClick={() => setAbierto((v) => !v)} aria-label="Más formatos">
        <ChevronDown className="size-3.5" />
      </Boton>
      {abierto && (
        <div className="absolute right-0 top-9 z-20 w-48 rounded-md border border-slate-200 bg-white py-1 text-sm">
          {FORMATOS.map((f) => (
            <button key={f.valor} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-50" onClick={() => (setAbierto(false), abrirPdf(id, f.valor))}>
              <Printer className="size-3.5 text-slate-400" /> {f.etiqueta}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
