import { ESTADOS, ICONO_OBSERVACION, type EstadoSunat } from '@/lib/sunat'
import { Insignia } from './ui'
import { cn } from '@/lib/utils'

/** Badge del semáforo SUNAT. Muestra código/descripción en el tooltip y marca observaciones. */
export function EstadoSunatBadge({
  estado,
  codigo,
  descripcion,
  notas,
}: {
  estado: EstadoSunat
  codigo?: string | null
  descripcion?: string | null
  notas?: unknown
}) {
  const meta = ESTADOS[estado] ?? ESTADOS.pendiente
  const Icono = meta.icono
  const conObservaciones = estado === 'aceptado' && Array.isArray(notas) && notas.length > 0
  const tooltip = [meta.ayuda, codigo ? `Código ${codigo}` : null, descripcion].filter(Boolean).join(' · ')
  return (
    <Insignia className={meta.clase}>
      <span title={tooltip} className="inline-flex items-center gap-1">
        <Icono className={cn('size-3.5', meta.gira && 'animate-spin [animation-duration:2s]')} aria-hidden />
        {conObservaciones ? 'Aceptado con observaciones' : meta.etiqueta}
        {conObservaciones && <ICONO_OBSERVACION className="size-3.5 text-amber-600" aria-hidden />}
      </span>
    </Insignia>
  )
}
