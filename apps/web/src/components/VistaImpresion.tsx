import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, FileArchive, FileCode2, Loader2, Printer, X } from 'lucide-react'
import { api, mensajeError } from '@/lib/api'
import { descargarArchivo } from '@/lib/descargas'
import { FORMATOS, type EstadoSunat, type Formato } from '@/lib/sunat'
import { cn } from '@/lib/utils'
import { EstadoSunatBadge } from './EstadoSunat'

const CON_CDR: EstadoSunat[] = ['aceptado', 'rechazado', 'anulacion_en_proceso', 'anulado']

/** Etiqueta corta para el riel lateral. */
const CORTO: Record<Formato, string> = { a4: 'A4', a5: 'A5', 'ticket-80': '80', 'ticket-58': '58' }

export interface ComprobanteImprimible {
  id: number
  numero_completo: string | null
  sunat_estado: EstadoSunat
}

/**
 * Vista previa de impresión: muestra el PDF de la API SUNAT y permite cambiar entre
 * A4, A5, ticket 80 mm y 58 mm, imprimir y descargar PDF, XML y CDR.
 */
export function VistaImpresion({ comprobante, onCerrar }: { comprobante: ComprobanteImprimible; onCerrar: () => void }) {
  const [formato, setFormato] = useState<Formato | null>(null) // null = predeterminado del usuario/caja/sucursal/empresa
  const [pdf, setPdf] = useState<{ url: string; nombre: string; formato: Formato } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const cache = useRef(new Map<string, { url: string; nombre: string; formato: Formato }>())
  const marco = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    let vigente = true
    const clave = formato ?? 'predeterminado'
    const enCache = cache.current.get(clave)
    if (enCache) {
      setPdf(enCache)
      setCargando(false)
      return
    }
    setCargando(true)
    setError(null)
    api
      .blob(`/comprobantes/${comprobante.id}/pdf${formato ? `?formato=${formato}` : ''}`)
      .then(({ blob, nombre, formato: efectivo }) => {
        const doc = { url: URL.createObjectURL(new Blob([blob], { type: 'application/pdf' })), nombre, formato: (efectivo as Formato) ?? formato ?? 'a4' }
        cache.current.set(clave, doc)
        cache.current.set(doc.formato, doc)
        if (vigente) setPdf(doc)
      })
      .catch((e) => vigente && setError(mensajeError(e)))
      .finally(() => vigente && setCargando(false))
    return () => {
      vigente = false
    }
  }, [comprobante.id, formato])

  // Libera las URLs al cerrar
  useEffect(() => {
    const urls = cache.current
    return () => new Set([...urls.values()].map((d) => d.url)).forEach((u) => URL.revokeObjectURL(u))
  }, [])

  // Esc cierra
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onCerrar])

  const imprimir = () => {
    try {
      marco.current?.contentWindow?.focus()
      marco.current?.contentWindow?.print()
    } catch {
      if (pdf) window.open(pdf.url, '_blank')
    }
  }
  const descargarPdf = () => {
    if (!pdf) return
    const a = document.createElement('a')
    a.href = pdf.url
    a.download = pdf.nombre
    a.click()
  }

  const activo = pdf?.formato ?? formato
  const hayCdr = CON_CDR.includes(comprobante.sunat_estado)

  return createPortal(
    <div className="fixed inset-0 z-50 flex bg-slate-900/70 p-2 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-label="Vista previa de impresión">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-slate-800 shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-700 px-4 py-2.5 text-slate-100">
          <Printer className="size-4 text-slate-400" />
          <span className="font-medium">{comprobante.numero_completo ?? 'Comprobante'}</span>
          <span className="text-sm text-slate-400">· {FORMATOS.find((f) => f.valor === activo)?.etiqueta ?? 'Formato predeterminado'}</span>
          <span className="ml-auto"><EstadoSunatBadge estado={comprobante.sunat_estado} /></span>
        </div>
        <div className="relative flex-1 bg-slate-600">
          {cargando && (
            <div className="absolute inset-0 grid place-items-center text-slate-200">
              <span className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Generando PDF…</span>
            </div>
          )}
          {error && !cargando && <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-rose-200">{error}</div>}
          {pdf && !error && <iframe ref={marco} src={`${pdf.url}#navpanes=0&view=FitH`} title="Vista previa del comprobante" className={cn('size-full', cargando && 'invisible')} />}
        </div>
      </div>

      {/* Riel lateral como en el visor */}
      <div className="ml-2 flex w-16 shrink-0 flex-col items-center gap-2 rounded-xl bg-white py-3 shadow-2xl sm:ml-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Formato</span>
        {FORMATOS.map((f) => (
          <button
            key={f.valor}
            onClick={() => setFormato(f.valor)}
            title={f.etiqueta}
            aria-pressed={activo === f.valor}
            className={cn(
              'grid size-11 place-items-center rounded-full border text-sm font-bold transition-colors',
              activo === f.valor ? 'border-acento-600 bg-acento-600 text-white' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
            )}
          >
            {CORTO[f.valor]}
          </button>
        ))}
        <div className="my-1 h-px w-8 bg-slate-200" />
        <BotonRiel titulo="Imprimir" onClick={imprimir} deshabilitado={!pdf || cargando} principal><Printer className="size-4" /></BotonRiel>
        <BotonRiel titulo="Descargar PDF" onClick={descargarPdf} deshabilitado={!pdf || cargando}><Download className="size-4" /></BotonRiel>
        <BotonRiel titulo="Descargar XML" onClick={() => descargarArchivo(`/comprobantes/${comprobante.id}/xml`)}><FileCode2 className="size-4" /></BotonRiel>
        <BotonRiel titulo={hayCdr ? 'Descargar CDR' : 'SUNAT aún no emite el CDR'} onClick={() => descargarArchivo(`/comprobantes/${comprobante.id}/cdr`)} deshabilitado={!hayCdr}><FileArchive className="size-4" /></BotonRiel>
        <div className="mt-auto" />
        <BotonRiel titulo="Cerrar (Esc)" onClick={onCerrar}><X className="size-4" /></BotonRiel>
      </div>
    </div>,
    document.body
  )
}

function BotonRiel({ titulo, onClick, children, deshabilitado, principal }: { titulo: string; onClick: () => void; children: React.ReactNode; deshabilitado?: boolean; principal?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={deshabilitado}
      title={titulo}
      aria-label={titulo}
      className={cn(
        'grid size-11 place-items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        principal ? 'border-acento-600 bg-acento-50 text-acento-700 hover:bg-acento-100' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
      )}
    >
      {children}
    </button>
  )
}
