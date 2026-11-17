import { test } from '@japa/runner'
import {
  StockInsuficienteError,
  aplicarEntrada,
  aplicarSalida,
  costoDesdePrecioCompra,
  estadoCuota,
  repartirCuotas,
} from '#domain/kardex'

test.group('Kardex: costo promedio ponderado', () => {
  test('la primera entrada fija el costo promedio', ({ assert }) => {
    const r = aplicarEntrada({ cantidad: 0, costoPromedio: 0 }, 10, 5)
    assert.deepEqual(r.saldo, { cantidad: 10, costoPromedio: 5 })
    assert.equal(r.costoTotal, 50)
    assert.equal(r.saldoValor, 50)
  })

  test('una segunda entrada promedia por valor', ({ assert }) => {
    const r = aplicarEntrada({ cantidad: 10, costoPromedio: 5 }, 30, 7)
    assert.equal(r.saldo.cantidad, 40)
    assert.equal(r.saldo.costoPromedio, 6.5)
    assert.equal(r.saldoValor, 260)
  })

  test('la salida usa el costo promedio y no lo modifica', ({ assert }) => {
    const r = aplicarSalida({ cantidad: 40, costoPromedio: 6.5 }, 15)
    assert.deepEqual(r.saldo, { cantidad: 25, costoPromedio: 6.5 })
    assert.equal(r.costoUnitario, 6.5)
    assert.equal(r.costoTotal, 97.5)
  })

  test('rechaza salida sin stock salvo que se permita', ({ assert }) => {
    assert.throws(() => aplicarSalida({ cantidad: 2, costoPromedio: 1 }, 3), /Stock insuficiente/)
    const r = aplicarSalida({ cantidad: 2, costoPromedio: 1 }, 3, true)
    assert.equal(r.saldo.cantidad, -1)
  })

  test('una entrada sobre saldo negativo reinicia el promedio con el costo entrante', ({
    assert,
  }) => {
    const r = aplicarEntrada({ cantidad: -1, costoPromedio: 1 }, 5, 4)
    assert.deepEqual(r.saldo, { cantidad: 4, costoPromedio: 4 })
  })

  test('entrada que deja saldo en cero conserva el costo entrante', ({ assert }) => {
    const r = aplicarEntrada({ cantidad: -2, costoPromedio: 1 }, 2, 3)
    assert.deepEqual(r.saldo, { cantidad: 0, costoPromedio: 3 })
  })

  test('valida cantidades y costos', ({ assert }) => {
    assert.throws(() => aplicarEntrada({ cantidad: 0, costoPromedio: 0 }, 0, 1), /mayor a 0/)
    assert.throws(() => aplicarEntrada({ cantidad: 0, costoPromedio: 0 }, 1, -1), /negativo/)
    assert.throws(() => aplicarSalida({ cantidad: 1, costoPromedio: 0 }, 0), /mayor a 0/)
  })

  test('el mensaje de stock insuficiente indica disponible y solicitado', ({ assert }) => {
    const e = new StockInsuficienteError(2, 3)
    assert.equal(e.disponible, 2)
    assert.include(e.message, 'disponible 2')
  })
})

test.group('Kardex: costos de compra y cuotas', () => {
  test('quita IGV solo a productos gravados y convierte moneda', ({ assert }) => {
    assert.equal(costoDesdePrecioCompra(11.8, '10', 0.18), 10)
    assert.equal(costoDesdePrecioCompra(10, '20', 0.18), 10)
    assert.equal(costoDesdePrecioCompra(11.8, '10', 0.18, 3.75), 37.5)
  })

  test('reparte cuotas ajustando el redondeo en la última', ({ assert }) => {
    assert.deepEqual(repartirCuotas(100, 3), [33.33, 33.33, 33.34])
    assert.deepEqual(repartirCuotas(50, 1), [50])
    assert.throws(() => repartirCuotas(10, 0))
  })

  test('estado de cuota según saldo', ({ assert }) => {
    assert.equal(estadoCuota(100, 100), 'pendiente')
    assert.equal(estadoCuota(100, 40), 'parcial')
    assert.equal(estadoCuota(100, 0), 'pagada')
  })
})
