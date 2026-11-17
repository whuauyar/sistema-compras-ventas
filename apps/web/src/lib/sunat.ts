import { Ban, CircleAlert, CircleCheck, Clock, FileClock, Loader, WifiOff, XCircle, type LucideIcon } from 'lucide-react'

export type EstadoSunat =
  | 'borrador'
  | 'pendiente'
  | 'enviado'
  | 'aceptado'
  | 'rechazado'
  | 'anulacion_en_proceso'
  | 'anulado'
  | 'error_envio'

/** Semáforo único de estados SUNAT para todo el sistema. pendiente/enviado NO son errores. */
export const ESTADOS: Record<EstadoSunat, { etiqueta: string; clase: string; icono: LucideIcon; gira?: boolean; ayuda: string }> = {
  borrador: { etiqueta: 'Borrador', clase: 'bg-slate-100 text-slate-600 ring-slate-200', icono: FileClock, ayuda: 'Aún no enviado.' },
  pendiente: { etiqueta: 'Pendiente', clase: 'bg-amber-50 text-amber-700 ring-amber-200', icono: Clock, ayuda: 'Registrado; SUNAT lo procesará. Se reconsulta automáticamente.' },
  enviado: { etiqueta: 'En proceso', clase: 'bg-sky-50 text-sky-700 ring-sky-200', icono: Loader, gira: true, ayuda: 'Enviado a SUNAT, esperando respuesta.' },
  aceptado: { etiqueta: 'Aceptado', clase: 'bg-emerald-50 text-emerald-700 ring-emerald-200', icono: CircleCheck, ayuda: 'Aceptado por SUNAT.' },
  rechazado: { etiqueta: 'Rechazado', clase: 'bg-rose-50 text-rose-700 ring-rose-200', icono: XCircle, ayuda: 'SUNAT lo rechazó. Revise el código y corrija.' },
  anulacion_en_proceso: { etiqueta: 'Anulando', clase: 'bg-slate-200 text-slate-700 ring-slate-300', icono: Loader, gira: true, ayuda: 'Anulación enviada a SUNAT.' },
  anulado: { etiqueta: 'Anulado', clase: 'bg-slate-100 text-slate-500 ring-slate-200', icono: Ban, ayuda: 'Comprobante anulado.' },
  error_envio: { etiqueta: 'Sin conexión', clase: 'bg-orange-50 text-orange-700 ring-orange-200', icono: WifiOff, ayuda: 'No se pudo conectar con el servicio de facturación. Se reintenta solo.' },
}

export const ICONO_OBSERVACION = CircleAlert

export const TIPOS_DOCUMENTO: Record<string, string> = {
  '01': 'Factura',
  '03': 'Boleta',
  '07': 'Nota de crédito',
  '08': 'Nota de débito',
  '09': 'Guía remitente',
  '31': 'Guía transportista',
}

export const FORMATOS = [
  { valor: 'a4', etiqueta: 'A4' },
  { valor: 'a5', etiqueta: 'A5' },
  { valor: 'ticket-80', etiqueta: 'Ticket 80 mm' },
  { valor: 'ticket-58', etiqueta: 'Ticket 58 mm' },
] as const

export type Formato = (typeof FORMATOS)[number]['valor']

export const TIPOS_DOC_IDENTIDAD = [
  { valor: '0', etiqueta: 'Sin documento' },
  { valor: '1', etiqueta: 'DNI' },
  { valor: '6', etiqueta: 'RUC' },
  { valor: '4', etiqueta: 'Carné de extranjería' },
  { valor: '7', etiqueta: 'Pasaporte' },
]

export const AFECTACIONES = [
  { valor: '10', etiqueta: 'Gravado' },
  { valor: '20', etiqueta: 'Exonerado' },
  { valor: '30', etiqueta: 'Inafecto' },
]

export const UNIDADES = [
  { valor: 'NIU', etiqueta: 'Unidad' },
  { valor: 'ZZ', etiqueta: 'Servicio' },
  { valor: 'KGM', etiqueta: 'Kilogramo' },
  { valor: 'LTR', etiqueta: 'Litro' },
  { valor: 'BX', etiqueta: 'Caja' },
  { valor: 'DZN', etiqueta: 'Docena' },
]
