import { useEffect, useRef, useState } from 'react'
import { ChevronDown, FileCode2, FileArchive, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { api, mensajeError } from '@/lib/api'
import { FORMATOS, type Formato } from '@/lib/sunat'
import { Boton } from './ui'

/** Abre el PDF (vía backend) en una pestaña nueva para imprimir. Sin formato = predeterminado. */
async function abrirPdf(id: number, formato?: Formato) {
  // Se abre la ventana antes del await para que el navegador no la bloquee como popup
  const ventana = window.open('', '_blank')
  try {
    const { blob } = await api.blob(`/comprobantes/${id}/pdf${formato ? `?formato=${formato}` : ''}`)
    const url = URL.createObjectURL(blob)
    if (ventana) ventana.location.href = url
    else window.location.href = url
  } catch (e) {
    ventana?.close()
    toast.error(mensajeError(e))
  }
}

async function descargar(id: number, recurso: 'xml' | 'cdr') {
  try {
    const { blob, nombre } = await api.blob(`/comprobantes/${id}/${recurso}`)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = nombre
    a.click()
    URL.revokeObjectURL(a.href)
  } catch (e) {
    toast.error(mensajeError(e))
  }
}

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
          <div className="my-1 border-t border-slate-100" />
          <button className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-50" onClick={() => (setAbierto(false), descargar(id, 'xml'))}>
            <FileCode2 className="size-3.5 text-slate-400" /> Descargar XML
          </button>
          <button className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-50" onClick={() => (setAbierto(false), descargar(id, 'cdr'))}>
            <FileArchive className="size-3.5 text-slate-400" /> Descargar CDR
          </button>
        </div>
      )}
    </div>
  )
}
