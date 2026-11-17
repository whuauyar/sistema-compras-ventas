/**
 * Kardex valorizado por COSTO PROMEDIO PONDERADO (puro, sin BD).
 * Cantidades a 4 decimales, costos unitarios a 6, valores a 2.
 */
export interface Saldo {
  cantidad: number
  costoPromedio: number
}

export interface ResultadoMovimiento {
  saldo: Saldo
  costoUnitario: number
  costoTotal: number
  saldoValor: number
}

const r = (n: number, d: number) => {
  const f = 10 ** d
  return Math.round((n + Number.EPSILON) * f) / f
}
export const redondearCantidad = (n: number) => r(n, 4)
export const redondearCosto = (n: number) => r(n, 6)
export const redondearMonto = (n: number) => r(n, 2)

export class StockInsuficienteError extends Error {
  constructor(
    public readonly disponible: number,
    public readonly solicitado: number
  ) {
    super(`Stock insuficiente: disponible ${disponible}, solicitado ${solicitado}.`)
  }
}

/** Entrada: recalcula el costo promedio = (valor anterior + valor entrante) / cantidad nueva. */
export function aplicarEntrada(
  saldo: Saldo,
  cantidad: number,
  costoUnitario: number
): ResultadoMovimiento {
  if (cantidad <= 0) throw new Error('La cantidad de entrada debe ser mayor a 0.')
  if (costoUnitario < 0) throw new Error('El costo no puede ser negativo.')
  const nuevaCantidad = redondearCantidad(saldo.cantidad + cantidad)
  // Si el saldo previo es negativo (venta sin stock permitida) el promedio se reinicia con el costo entrante
  const valorPrevio = saldo.cantidad > 0 ? saldo.cantidad * saldo.costoPromedio : 0
  const cantidadPrevia = Math.max(saldo.cantidad, 0)
  const costoPromedio =
    nuevaCantidad > 0
      ? redondearCosto((valorPrevio + cantidad * costoUnitario) / (cantidadPrevia + cantidad))
      : costoUnitario
  return {
    saldo: { cantidad: nuevaCantidad, costoPromedio },
    costoUnitario: redondearCosto(costoUnitario),
    costoTotal: redondearMonto(cantidad * costoUnitario),
    saldoValor: redondearMonto(nuevaCantidad * costoPromedio),
  }
}

/** Salida: sale al costo promedio vigente; el promedio no cambia. */
export function aplicarSalida(
  saldo: Saldo,
  cantidad: number,
  permitirNegativo = false
): ResultadoMovimiento {
  if (cantidad <= 0) throw new Error('La cantidad de salida debe ser mayor a 0.')
  if (!permitirNegativo && redondearCantidad(saldo.cantidad - cantidad) < 0) {
    throw new StockInsuficienteError(saldo.cantidad, cantidad)
  }
  const nuevaCantidad = redondearCantidad(saldo.cantidad - cantidad)
  return {
    saldo: { cantidad: nuevaCantidad, costoPromedio: saldo.costoPromedio },
    costoUnitario: saldo.costoPromedio,
    costoTotal: redondearMonto(cantidad * saldo.costoPromedio),
    saldoValor: redondearMonto(nuevaCantidad * saldo.costoPromedio),
  }
}

/** Costo unitario sin IGV y en soles a partir de un precio de compra con IGV. */
export function costoDesdePrecioCompra(
  precioConIgv: number,
  tipAfeIgv: string,
  igvTasa: number,
  tipoCambio = 1
): number {
  const sinIgv = tipAfeIgv.startsWith('1') ? precioConIgv / (1 + igvTasa) : precioConIgv
  return redondearCosto(sinIgv * tipoCambio)
}

/** Reparte un monto en N cuotas iguales (el redondeo se ajusta en la última). */
export function repartirCuotas(total: number, numero: number): number[] {
  if (numero < 1) throw new Error('Debe haber al menos una cuota.')
  const centimos = Math.round(total * 100)
  const base = Math.floor(centimos / numero)
  const cuotas = Array.from({ length: numero }, () => base)
  cuotas[numero - 1] += centimos - base * numero
  return cuotas.map((c) => c / 100)
}

/** Estado de una cuota según su saldo. */
export function estadoCuota(monto: number, saldo: number): 'pendiente' | 'parcial' | 'pagada' {
  if (saldo <= 0) return 'pagada'
  return saldo < monto ? 'parcial' : 'pendiente'
}
