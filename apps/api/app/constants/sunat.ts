/**
 * Catálogos SUNAT usados por el sistema (subconjunto; la API es la fuente de verdad).
 */

export const TIPO_DOCUMENTO = {
  FACTURA: '01',
  BOLETA: '03',
  NOTA_CREDITO: '07',
  NOTA_DEBITO: '08',
  GUIA_REMITENTE: '09',
  GUIA_TRANSPORTISTA: '31',
} as const

export type TipoDocumento = (typeof TIPO_DOCUMENTO)[keyof typeof TIPO_DOCUMENTO]

/** Ruta del recurso en la API SUNAT por tipo de documento. */
export const RUTA_API: Record<TipoDocumento, string> = {
  '01': 'facturas',
  '03': 'boletas',
  '07': 'notas-credito',
  '08': 'notas-debito',
  '09': 'guias-remision',
  '31': 'guias-remision-transportista',
}

/** Nombre del tipo de serie en la API (`POST /series` campo `tipo`). */
export const TIPO_SERIE_API: Record<TipoDocumento, string> = {
  '01': 'factura',
  '03': 'boleta',
  '07': 'nota_credito',
  '08': 'nota_debito',
  '09': 'guia_remision',
  '31': 'guia_transportista',
}

/** Prefijo de serie obligatorio por tipo (NC/ND usan el prefijo del documento que afectan). */
export const PREFIJO_SERIE: Record<TipoDocumento, string[]> = {
  '01': ['F'],
  '03': ['B'],
  '07': ['F', 'B'],
  '08': ['F', 'B'],
  '09': ['T'],
  '31': ['V'],
}

export const NOMBRE_DOCUMENTO: Record<TipoDocumento, string> = {
  '01': 'Factura',
  '03': 'Boleta de venta',
  '07': 'Nota de crédito',
  '08': 'Nota de débito',
  '09': 'Guía de remisión remitente',
  '31': 'Guía de remisión transportista',
}

/** Estados SUNAT que devuelve la API + estados locales (borrador, error_envio). */
export const ESTADOS_SUNAT = [
  'borrador',
  'pendiente',
  'enviado',
  'aceptado',
  'rechazado',
  'anulacion_en_proceso',
  'anulado',
  'error_envio',
] as const

export type EstadoSunat = (typeof ESTADOS_SUNAT)[number]

/** Estados que requieren reconsulta periódica a la API. */
export const ESTADOS_EN_PROCESO: EstadoSunat[] = ['pendiente', 'enviado', 'anulacion_en_proceso']

export const FORMATOS_IMPRESION = ['a4', 'a5', 'ticket-80', 'ticket-58'] as const
export type FormatoImpresion = (typeof FORMATOS_IMPRESION)[number]

/** Cat 06: tipo de documento de identidad. */
export const TIPOS_DOC_IDENTIDAD = ['0', '1', '4', '6', '7', 'A'] as const

/** Cat 07: afectación IGV más usadas. */
export const AFECTACIONES_IGV = ['10', '20', '30', '40'] as const

export const MONTO_MAXIMO_BOLETA_SIN_DOC = 700
