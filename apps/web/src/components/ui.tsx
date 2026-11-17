import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variante = 'primario' | 'secundario' | 'fantasma' | 'peligro'

const variantes: Record<Variante, string> = {
  primario: 'bg-acento-600 text-white hover:bg-acento-700 disabled:bg-acento-600/60',
  secundario: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  fantasma: 'text-slate-600 hover:bg-slate-100',
  peligro: 'bg-rose-600 text-white hover:bg-rose-700',
}

export const Boton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; cargando?: boolean; tamano?: 'sm' | 'md' }
>(function Boton({ className, variante = 'primario', cargando, tamano = 'md', children, disabled, ...props }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || cargando}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento-600 disabled:cursor-not-allowed disabled:opacity-60',
        tamano === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
        variantes[variante],
        className
      )}
      {...props}
    >
      {cargando && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  )
})

const claseCampo =
  'h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm placeholder:text-slate-400 focus:border-acento-600 focus:outline-none focus:ring-2 focus:ring-acento-100 disabled:bg-slate-50 aria-invalid:border-rose-400'

export const Entrada = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Entrada(
  { className, ...props },
  ref
) {
  return <input ref={ref} className={cn(claseCampo, className)} {...props} />
})

export const Selector = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Selector(
  { className, children, ...props },
  ref
) {
  return (
    <select ref={ref} className={cn(claseCampo, 'pr-8', className)} {...props}>
      {children}
    </select>
  )
})

export function Campo({ etiqueta, error, ayuda, children, className }: { etiqueta: string; error?: string; ayuda?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-sm font-medium text-slate-700">{etiqueta}</span>
      {children}
      {error ? <span className="text-xs text-rose-600">{error}</span> : ayuda ? <span className="text-xs text-slate-500">{ayuda}</span> : null}
    </label>
  )
}

export function Tarjeta({ titulo, descripcion, acciones, children, className }: { titulo?: string; descripcion?: string; acciones?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-lg border border-slate-200 bg-white', className)}>
      {(titulo || acciones) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            {titulo && <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>}
            {descripcion && <p className="mt-0.5 text-sm text-slate-500">{descripcion}</p>}
          </div>
          {acciones}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}

export function Encabezado({ titulo, descripcion, acciones }: { titulo: string; descripcion?: string; acciones?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{titulo}</h1>
        {descripcion && <p className="mt-1 text-sm text-slate-500">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
    </div>
  )
}

export function Tabla({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-left text-sm [&_td]:px-4 [&_td]:py-3 [&_th]:px-4 [&_th]:py-2.5 [&_th]:text-xs [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-slate-500 [&_thead]:bg-slate-50 [&_tbody_tr]:border-t [&_tbody_tr]:border-slate-100">
        {children}
      </table>
    </div>
  )
}

export function Vacio({ icono, titulo, texto, accion }: { icono: ReactNode; titulo: string; texto?: string; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <div className="text-slate-400">{icono}</div>
      <p className="font-medium text-slate-800">{titulo}</p>
      {texto && <p className="max-w-md text-sm text-slate-500">{texto}</p>}
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  )
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
      <Loader2 className="size-4 animate-spin" /> {texto}
    </div>
  )
}

export function Insignia({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', className)}>{children}</span>
}

export function Dialogo({ abierto, titulo, onCerrar, children, ancho = 'max-w-lg' }: { abierto: boolean; titulo: string; onCerrar: () => void; children: ReactNode; ancho?: string }) {
  if (!abierto) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center" onMouseDown={onCerrar}>
      <div role="dialog" aria-modal="true" aria-label={titulo} className={cn('w-full rounded-lg border border-slate-200 bg-white', ancho)} onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="font-semibold text-slate-900">{titulo}</h2>
          <button onClick={onCerrar} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
