import { toast } from 'sonner'
import { api, mensajeError } from './api'

/** Descarga autenticada de un archivo (CSV, XML…) desde el backend. */
export async function descargarCsv(ruta: string) {
  try {
    const { blob, nombre } = await api.blob(ruta)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = nombre
    a.click()
    URL.revokeObjectURL(a.href)
  } catch (e) {
    toast.error(mensajeError(e))
  }
}
