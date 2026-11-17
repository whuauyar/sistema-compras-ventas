/** Tipos compartidos de las respuestas del backend (snake_case). */
export interface Paginado<T> {
  meta: { total: number; per_page: number; current_page: number; last_page: number }
  data: T[]
}

export interface Producto {
  id: number
  codigo: string
  codigo_barras: string | null
  nombre: string
  descripcion: string | null
  categoria_id: number | null
  categoria?: string | null
  unidad: string
  tip_afe_igv: string
  controla_stock: boolean
  precio_venta: number
  stock_minimo: number
  activo: boolean
  stock?: number
  valor_stock?: number
}

export interface Contacto {
  id: number
  tipo_doc: string
  num_doc: string
  razon_social: string
  nombre_comercial: string | null
  direccion: string | null
  ubigeo: string | null
  email: string | null
  telefono: string | null
  activo: boolean
}

export interface Almacen {
  id: number
  nombre: string
  sucursal_id: number
}

export interface Caja {
  id: number
  nombre: string
  sucursal_id: number
  apertura: null | { id: number; usuario_id: number; monto_inicial: number; abierta_en: string }
}

export const METODOS_PAGO = [
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'yape', etiqueta: 'Yape' },
  { valor: 'plin', etiqueta: 'Plin' },
  { valor: 'tarjeta', etiqueta: 'Tarjeta' },
  { valor: 'transferencia', etiqueta: 'Transferencia' },
  { valor: 'cheque', etiqueta: 'Cheque' },
  { valor: 'otro', etiqueta: 'Otro' },
] as const

export const ESTADO_CUOTA: Record<string, string> = {
  pendiente: 'bg-amber-50 text-amber-700 ring-amber-200',
  parcial: 'bg-sky-50 text-sky-700 ring-sky-200',
  pagada: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  anulada: 'bg-slate-100 text-slate-500 ring-slate-200',
}

export const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
export const inicioMes = () => `${hoy().slice(0, 8)}01`
