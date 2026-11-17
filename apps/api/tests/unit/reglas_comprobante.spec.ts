import { test } from '@japa/runner'
import {
  calcularTotales,
  esDniValido,
  esRucValido,
  normalizarEstadoSunat,
  resolverFormatoImpresion,
  validarComprobanteVenta,
  validarSerie,
  type DatosValidacion,
} from '#domain/reglas_comprobante'

const base = (cambios: Partial<DatosValidacion> = {}): DatosValidacion => ({
  tipoDocumento: '03',
  serie: 'B001',
  regimen: 'general',
  cliente: { tipo_doc: '0', num_doc: '00000000', razon_social: 'CLIENTES VARIOS' },
  items: [
    { descripcion: 'Producto', unidad: 'NIU', cantidad: 2, precio_unitario: 5, tip_afe_igv: '10' },
  ],
  formaPago: 'Contado',
  igvTasa: 0.18,
  ...cambios,
})

const campos = (datos: DatosValidacion) => validarComprobanteVenta(datos).map((e) => e.campo)

test.group('Reglas de comprobante: totales', () => {
  test('separa IGV de un precio que ya lo incluye', ({ assert }) => {
    const t = calcularTotales(base().items, 0.18)
    assert.deepEqual(t, { gravadas: 8.47, exoneradas: 0, inafectas: 0, igv: 1.53, total: 10 })
  })

  test('suma exoneradas e inafectas sin IGV', ({ assert }) => {
    const t = calcularTotales(
      [
        { descripcion: 'A', unidad: 'NIU', cantidad: 1, precio_unitario: 11.8, tip_afe_igv: '10' },
        { descripcion: 'B', unidad: 'NIU', cantidad: 3, precio_unitario: 2, tip_afe_igv: '20' },
        { descripcion: 'C', unidad: 'NIU', cantidad: 1, precio_unitario: 4.5, tip_afe_igv: '30' },
      ],
      0.18
    )
    assert.deepEqual(t, { gravadas: 10, exoneradas: 6, inafectas: 4.5, igv: 1.8, total: 22.3 })
  })

  test('no acumula error de coma flotante', ({ assert }) => {
    const items = Array.from({ length: 10 }, () => ({
      descripcion: 'x',
      unidad: 'NIU',
      cantidad: 1,
      precio_unitario: 0.1,
      tip_afe_igv: '20',
    }))
    assert.equal(calcularTotales(items, 0.18).total, 1)
  })
})

test.group('Reglas de comprobante: validaciones', () => {
  test('una boleta válida no tiene errores', ({ assert }) => {
    assert.deepEqual(validarComprobanteVenta(base()), [])
  })

  test('boleta mayor a S/ 700 exige documento del cliente', ({ assert }) => {
    const datos = base({
      items: [
        {
          descripcion: 'TV',
          unidad: 'NIU',
          cantidad: 1,
          precio_unitario: 700.01,
          tip_afe_igv: '10',
        },
      ],
    })
    assert.include(campos(datos), 'cliente.tipo_doc')
  })

  test('boleta de exactamente S/ 700 sin documento es válida', ({ assert }) => {
    const datos = base({
      items: [
        { descripcion: 'TV', unidad: 'NIU', cantidad: 1, precio_unitario: 700, tip_afe_igv: '10' },
      ],
    })
    assert.deepEqual(validarComprobanteVenta(datos), [])
  })

  test('factura exige RUC y dirección', ({ assert }) => {
    const datos = base({
      tipoDocumento: '01',
      serie: 'F001',
      cliente: { tipo_doc: '1', num_doc: '12345678', razon_social: 'Juan' },
    })
    assert.includeMembers(campos(datos), ['cliente.tipo_doc', 'cliente.direccion'])
  })

  test('factura con RUC válido y dirección es aceptada', ({ assert }) => {
    const datos = base({
      tipoDocumento: '01',
      serie: 'F001',
      cliente: {
        tipo_doc: '6',
        num_doc: '20512345678',
        razon_social: 'ACME SAC',
        direccion: 'Lima',
      },
    })
    assert.deepEqual(validarComprobanteVenta(datos), [])
  })

  test('el Nuevo RUS no puede emitir facturas', ({ assert }) => {
    const datos = base({
      tipoDocumento: '01',
      serie: 'F001',
      regimen: 'rus',
      cliente: { tipo_doc: '6', num_doc: '20512345678', razon_social: 'ACME', direccion: 'Lima' },
    })
    assert.include(campos(datos), 'tipo_documento')
  })

  test('valida formato de DNI y RUC', ({ assert }) => {
    assert.include(
      campos(base({ cliente: { tipo_doc: '1', num_doc: '123', razon_social: 'X' } })),
      'cliente.num_doc'
    )
    assert.include(
      campos(base({ cliente: { tipo_doc: '6', num_doc: '30512345678', razon_social: 'X' } })),
      'cliente.num_doc'
    )
  })

  test('rechaza ítems vacíos, cantidad cero y precio negativo', ({ assert }) => {
    assert.include(campos(base({ items: [] })), 'items')
    const errores = campos(
      base({
        items: [
          { descripcion: 'x', unidad: 'NIU', cantidad: 0, precio_unitario: -1, tip_afe_igv: '10' },
        ],
      })
    )
    assert.includeMembers(errores, ['items.0.cantidad', 'items.0.precio_unitario'])
  })

  test('crédito exige cuotas y que no superen el total', ({ assert }) => {
    assert.include(campos(base({ formaPago: 'Credito' })), 'cuotas')
    assert.include(
      campos(base({ formaPago: 'Credito', cuotas: [{ monto: 11, fecha_pago: '2026-12-01' }] })),
      'cuotas'
    )
    assert.deepEqual(
      validarComprobanteVenta(
        base({ formaPago: 'Credito', cuotas: [{ monto: 10, fecha_pago: '2026-12-01' }] })
      ),
      []
    )
  })
})

test.group('Reglas de comprobante: series, documentos, estados y formato', () => {
  test('valida prefijo y formato de serie', ({ assert }) => {
    assert.isNull(validarSerie('01', 'F001'))
    assert.equal(validarSerie('01', 'B001')?.campo, 'serie')
    assert.equal(validarSerie('03', 'b01')?.campo, 'serie')
    assert.isNull(validarSerie('07', 'BC01'))
    assert.isNull(validarSerie('09', 'T001'))
  })

  test('reconoce RUC y DNI', ({ assert }) => {
    assert.isTrue(esRucValido('10456789012'))
    assert.isFalse(esRucValido('2051234567'))
    assert.isTrue(esDniValido('45678901'))
    assert.isFalse(esDniValido('4567890'))
  })

  test('normaliza estados SUNAT desconocidos a pendiente', ({ assert }) => {
    assert.equal(normalizarEstadoSunat('ACEPTADO'), 'aceptado')
    assert.equal(normalizarEstadoSunat('rechazado'), 'rechazado')
    assert.equal(normalizarEstadoSunat('raro'), 'pendiente')
    assert.equal(normalizarEstadoSunat(undefined), 'pendiente')
  })

  test('formato de impresión: usuario > caja > sucursal > empresa', ({ assert }) => {
    assert.equal(resolverFormatoImpresion({ empresa: 'a4' }), 'a4')
    assert.equal(resolverFormatoImpresion({ empresa: 'a4', sucursal: 'a5' }), 'a5')
    assert.equal(
      resolverFormatoImpresion({ empresa: 'a4', sucursal: 'a5', caja: 'ticket-80' }),
      'ticket-80'
    )
    assert.equal(
      resolverFormatoImpresion({
        empresa: 'a4',
        sucursal: 'a5',
        caja: 'ticket-80',
        usuario: 'ticket-58',
      }),
      'ticket-58'
    )
  })
})
