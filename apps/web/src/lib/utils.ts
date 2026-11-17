import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const cn = (...clases: ClassValue[]) => twMerge(clsx(clases))

export const soles = (monto: number | string, moneda = 'PEN') =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: moneda }).format(Number(monto))

export const fecha = (iso?: string | null) =>
  iso ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)) : '—'

/** localStorage puede fallar (modo privado, iframes); nunca debe romper la app. */
export const almacen = {
  leer(clave: string): string | null {
    try {
      return localStorage.getItem(clave)
    } catch {
      return null
    }
  },
  guardar(clave: string, valor: string | null) {
    try {
      if (valor === null) localStorage.removeItem(clave)
      else localStorage.setItem(clave, valor)
    } catch {
      /* sin almacenamiento: la sesión vive solo en memoria */
    }
  },
}
