import { useState } from 'react'
import { toast } from 'sonner'
import { api, mensajeError } from '@/lib/api'
import { Boton, Campo, Dialogo, Entrada } from './ui'

/** Anulación: boletas por Resumen Diario; facturas y notas por Comunicación de Baja. */
export function FormAnular({ comprobante, onCerrar, onGuardado }: { comprobante: { id: number; tipo_documento: string; numero_completo: string | null }; onCerrar: () => void; onGuardado: () => void }) {
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const esBoleta = comprobante.tipo_documento === '03'
  const anular = async () => {
    setEnviando(true)
    try {
      await api.post('/anulaciones', { comprobante_ids: [comprobante.id], motivo })
      toast.success('Solicitud enviada a SUNAT. El estado se actualizará solo.')
      onGuardado()
      onCerrar()
    } catch (e) {
      toast.error(mensajeError(e))
    } finally {
      setEnviando(false)
    }
  }
  return (
    <Dialogo abierto titulo={`Anular ${comprobante.numero_completo}`} onCerrar={onCerrar}>
      <div className="flex flex-col gap-4">
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          {esBoleta ? 'Las boletas se anulan con un Resumen Diario.' : 'Se enviará una Comunicación de Baja.'} Solo dentro de los 7 días de emitido. Al ser aceptada, la venta se revierte y el stock vuelve al almacén.
        </p>
        <Campo etiqueta="Motivo"><Entrada value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={255} autoFocus /></Campo>
        <Boton variante="peligro" onClick={anular} cargando={enviando} disabled={motivo.trim().length < 3} className="self-start">Anular comprobante</Boton>
      </div>
    </Dialogo>
  )
}
