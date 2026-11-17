import {
  ESTADOS_SUNAT,
  MONTO_MAXIMO_BOLETA_SIN_DOC,
  PREFIJO_SERIE,
  TIPO_DOCUMENTO,
  type EstadoSunat,
  type FormatoImpresion,
  type TipoDocumento,
} from '#constants/sunat'

/**
 * Reglas fiscales puras (sin BD ni HTTP). Se validan ANTES de llamar a la API SUNAT para
 * dar mensajes inmediatos; la API vuelve a validar y es la fuente de verdad.
 */

export interface ItemComprobante {
  codigo?: string
  descripcion: string
  unidad: string
  cantidad: number
  /** Precio unitario CON IGV (así lo espera la API). */
  precio_unitario: number
  tip_afe_igv: string
}

export interface ClienteComprobante {
  tipo_doc: string
  num_doc: string
  razon_social: string
  direccion?: string | null
}

export interface Cuota {
  monto: number
  fecha_pago: string
}

export interface DatosValidacion {
  tipoDocumento: TipoDocumento
  serie: string
  regimen: 'general' | 'mype' | 'rer' | 'rus'
  cliente: ClienteComprobante
  items: ItemComprobante[]
  formaPago: 'Contado' | 'Credito'
  cuotas?: Cuota[]
  igvTasa: number
}

export interface ErrorRegla {
  campo: string
  mensaje: string
}

export interface Totales {
  gravadas: number
  exoneradas: number
  inafectas: number
  igv: number
  total: number
}

const aCentimos = (monto: number) => Math.round(monto * 100)
const aSoles = (centimos: number) => centimos / 100

/** Calcula totales a partir de precios CON IGV, trabajando en céntimos para evitar errores de coma flotante. */
export function calcularTotales(items: ItemComprobante[], igvTasa: number): Totales {
  let gravadasConIgv = 0
  let exoneradas = 0
  let inafectas = 0

  for (const item of items) {
    const importe = aCentimos(item.cantidad * item.precio_unitario)
    if (item.tip_afe_igv.startsWith('1')) gravadasConIgv += importe
    else if (item.tip_afe_igv.startsWith('2')) exoneradas += importe
    else inafectas += importe
  }

  const gravadas = Math.round(gravadasConIgv / (1 + igvTasa))
  const igv = gravadasConIgv - gravadas
  const total = gravadasConIgv + exoneradas + inafectas

  return {
    gravadas: aSoles(gravadas),
    exoneradas: aSoles(exoneradas),
    inafectas: aSoles(inafectas),
    igv: aSoles(igv),
    total: aSoles(total),
  }
}

export function esRucValido(numero: string): boolean {
  return /^(10|15|17|20)\d{9}$/.test(numero)
}

export function esDniValido(numero: string): boolean {
  return /^\d{8}$/.test(numero)
}

export function validarSerie(tipo: TipoDocumento, serie: string): ErrorRegla | null {
  if (!/^[A-Z][A-Z0-9]{3}$/.test(serie)) {
    return {
      campo: 'serie',
      mensaje: 'La serie debe tener 4 caracteres: una letra y 3 alfanuméricos (ej. F001).',
    }
  }
  if (!PREFIJO_SERIE[tipo].includes(serie[0])) {
    return {
      campo: 'serie',
      mensaje: `La serie de este documento debe empezar con ${PREFIJO_SERIE[tipo].join(' o ')}.`,
    }
  }
  return null
}

/** Valida reglas de factura/boleta. Devuelve la lista de errores (vacía si todo está bien). */
export function validarComprobanteVenta(datos: DatosValidacion): ErrorRegla[] {
  const errores: ErrorRegla[] = []
  const { tipoDocumento, cliente } = datos

  const errorSerie = validarSerie(tipoDocumento, datos.serie)
  if (errorSerie) errores.push(errorSerie)

  if (datos.items.length === 0) {
    errores.push({ campo: 'items', mensaje: 'El comprobante debe tener al menos un ítem.' })
  }
  datos.items.forEach((item, i) => {
    if (item.cantidad <= 0)
      errores.push({ campo: `items.${i}.cantidad`, mensaje: 'La cantidad debe ser mayor a 0.' })
    if (item.precio_unitario < 0) {
      errores.push({
        campo: `items.${i}.precio_unitario`,
        mensaje: 'El precio no puede ser negativo.',
      })
    }
  })

  if (cliente.tipo_doc === '1' && !esDniValido(cliente.num_doc)) {
    errores.push({ campo: 'cliente.num_doc', mensaje: 'El DNI debe tener 8 dígitos.' })
  }
  if (cliente.tipo_doc === '6' && !esRucValido(cliente.num_doc)) {
    errores.push({
      campo: 'cliente.num_doc',
      mensaje: 'El RUC debe tener 11 dígitos y empezar con 10, 15, 17 o 20.',
    })
  }

  if (tipoDocumento === TIPO_DOCUMENTO.FACTURA) {
    if (datos.regimen === 'rus') {
      errores.push({
        campo: 'tipo_documento',
        mensaje: 'Las empresas del Nuevo RUS solo pueden emitir boletas.',
      })
    }
    if (cliente.tipo_doc !== '6') {
      errores.push({
        campo: 'cliente.tipo_doc',
        mensaje: 'La factura requiere un cliente con RUC. Use boleta para DNI.',
      })
    }
    if (!cliente.direccion?.trim()) {
      errores.push({
        campo: 'cliente.direccion',
        mensaje: 'La factura requiere la dirección del cliente.',
      })
    }
  }

  if (tipoDocumento === TIPO_DOCUMENTO.BOLETA) {
    const { total } = calcularTotales(datos.items, datos.igvTasa)
    if (total > MONTO_MAXIMO_BOLETA_SIN_DOC && cliente.tipo_doc === '0') {
      errores.push({
        campo: 'cliente.tipo_doc',
        mensaje: `Para boletas mayores a S/ ${MONTO_MAXIMO_BOLETA_SIN_DOC.toFixed(2)} debe indicar DNI o RUC del cliente.`,
      })
    }
  }

  if (datos.formaPago === 'Credito') {
    if (!datos.cuotas || datos.cuotas.length === 0) {
      errores.push({ campo: 'cuotas', mensaje: 'La venta al crédito requiere al menos una cuota.' })
    } else {
      const { total } = calcularTotales(datos.items, datos.igvTasa)
      const sumaCuotas = aSoles(datos.cuotas.reduce((s, c) => s + aCentimos(c.monto), 0))
      if (sumaCuotas > total) {
        errores.push({
          campo: 'cuotas',
          mensaje: 'La suma de las cuotas no puede superar el total.',
        })
      }
    }
  }

  return errores
}

/** Convierte el estado que devuelve la API a un estado conocido; lo desconocido se trata como pendiente. */
export function normalizarEstadoSunat(valor: unknown): EstadoSunat {
  const texto = String(valor ?? '').toLowerCase()
  return (ESTADOS_SUNAT as readonly string[]).includes(texto) ? (texto as EstadoSunat) : 'pendiente'
}

/**
 * Formato de impresión efectivo. Prioridad: usuario > caja > sucursal > empresa.
 */
export function resolverFormatoImpresion(opciones: {
  usuario?: FormatoImpresion | null
  caja?: FormatoImpresion | null
  sucursal?: FormatoImpresion | null
  empresa: FormatoImpresion
}): FormatoImpresion {
  return opciones.usuario ?? opciones.caja ?? opciones.sucursal ?? opciones.empresa
}
