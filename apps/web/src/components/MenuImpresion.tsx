import { useState } from 'react'
import { Printer } from 'lucide-react'
import type { EstadoSunat } from '@/lib/sunat'
import { Boton } from './ui'
import { VistaImpresion } from './VistaImpresion'

/** Botón "Imprimir": abre la vista previa con selector de formato (A4, A5, 80 mm, 58 mm). */
export function MenuImpresion({
  id,
  deshabilitado,
  numero = null,
  estado = 'aceptado',
}: {
  id: number
  deshabilitado?: boolean
  numero?: string | null
  estado?: EstadoSunat
}) {
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <Boton variante="secundario" tamano="sm" disabled={deshabilitado} onClick={() => setAbierto(true)} title="Vista previa e impresión">
        <Printer className="size-3.5" /> Imprimir
      </Boton>
      {abierto && <VistaImpresion comprobante={{ id, numero_completo: numero, sunat_estado: estado }} onCerrar={() => setAbierto(false)} />}
    </>
  )
}
