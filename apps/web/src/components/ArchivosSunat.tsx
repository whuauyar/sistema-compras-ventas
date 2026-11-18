import { useState } from 'react'
import { FileArchive, FileCode2 } from 'lucide-react'
import type { EstadoSunat } from '@/lib/sunat'
import { descargarArchivo } from '@/lib/descargas'
import { cn } from '@/lib/utils'
import { Boton } from './ui'

/** Estados en los que SUNAT ya respondió y existe CDR (constancia de recepción). */
const CON_CDR: EstadoSunat[] = ['aceptado', 'rechazado', 'anulacion_en_proceso', 'anulado']

/** Botones visibles para descargar el XML firmado y el CDR de SUNAT. */
export function ArchivosSunat({
  id,
  registrado,
  estado,
  compacto = false,
  className,
}: {
  id: number
  /** El comprobante ya existe en la API SUNAT (tiene sunat_api_id). */
  registrado: boolean
  estado: EstadoSunat
  compacto?: boolean
  className?: string
}) {
  const [bajando, setBajando] = useState<'xml' | 'cdr' | null>(null)
  const hayCdr = registrado && CON_CDR.includes(estado)

  const bajar = async (recurso: 'xml' | 'cdr') => {
    setBajando(recurso)
    await descargarArchivo(`/comprobantes/${id}/${recurso}`)
    setBajando(null)
  }

  return (
    <div className={cn('inline-flex gap-1.5', className)}>
      <Boton
        variante="secundario"
        tamano="sm"
        disabled={!registrado}
        cargando={bajando === 'xml'}
        title={registrado ? 'Descargar XML firmado' : 'Aún no registrado en SUNAT'}
        onClick={() => bajar('xml')}
      >
        <FileCode2 className="size-3.5" /> {compacto ? 'XML' : 'Descargar XML'}
      </Boton>
      <Boton
        variante="secundario"
        tamano="sm"
        disabled={!hayCdr}
        cargando={bajando === 'cdr'}
        title={hayCdr ? 'Descargar CDR (constancia de SUNAT, .zip)' : 'SUNAT aún no emite el CDR'}
        onClick={() => bajar('cdr')}
      >
        <FileArchive className="size-3.5" /> {compacto ? 'CDR' : 'Descargar CDR'}
      </Boton>
    </div>
  )
}
