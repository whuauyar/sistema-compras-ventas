import { toast } from 'sonner'
import { api, mensajeError } from './api'
import type { Formato } from './sunat'

/** Abre el PDF (vía backend) en una pestaña nueva para imprimir. Sin formato = predeterminado. */
export async function abrirPdf(id: number, formato?: Formato) {
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

