import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Empresa from '#models/empresa'
import Stock from '#models/stock'
import Venta from '#models/venta'
import MovimientoKardex from '#models/movimiento_kardex'
import CuentaCobrar from '#models/cuenta_cobrar'
import { SunatGateway } from '#integrations/sunat/sunat_service'
import {
  SunatFalsa,
  asignarRol,
  comprobanteApi,
  crearEmpresa,
  crearUsuario,
  datosInventario,
  emisiones,
  exito,
} from '#tests/helpers'

const h = (e: Empresa) => ({ 'x-empresa-id': String(e.id) })

async function escenario() {
  const admin = await crearUsuario()
  const empresa = await crearEmpresa(admin)
  return { admin, empresa, ...(await datosInventario(empresa)) }
}

async function cargarStock(
  c: any,
  e: Awaited<ReturnType<typeof escenario>>,
  cantidad = 10,
  costo = 15
) {
  const r = await c
    .post('/api/v1/inventario/ajustes')
    .loginAs(e.admin)
    .headers(h(e.empresa))
    .json({
      almacen_id: e.almacen.id,
      tipo: 'entrada',
      motivo: 'inventario_inicial',
      items: [{ producto_id: e.producto.id, cantidad, costo_unitario: costo }],
    })
  r.assertStatus(201)
}

const stock = async (productoId: number) =>
  (await Stock.query().where('producto_id', productoId).firstOrFail()).cantidad

test.group('POS: ventas', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.teardown(() => SunatGateway.usar(null))

  test('venta al contado: descuenta stock al costo, emite boleta y calcula vuelto', async ({
    client,
    assert,
  }) => {
    const falsa = new SunatFalsa()
      .cuando(
        'POST /boletas',
        exito(comprobanteApi({ totales: { gravadas: 44.07, igv: 7.93, total: 52 } }), 201)
      )
      .instalar()
    const e = await escenario()
    await cargarStock(client, e)
    const r = await client
      .post('/api/v1/ventas')
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json({
        tipo_documento: '03',
        moneda: 'PEN',
        forma_pago: 'Contado',
        items: [
          { producto_id: e.producto.id, cantidad: 2 },
          { producto_id: e.servicio.id, cantidad: 1 },
        ],
        pagos: [
          { metodo: 'yape', monto: 20 },
          { metodo: 'efectivo', monto: 40 },
        ],
      })
    r.assertStatus(201)
    assert.equal(r.body().venta.total, 53.1)
    assert.equal(r.body().venta.vuelto, 6.9)
    assert.equal(r.body().venta.costo_total, 30)
    assert.equal(r.body().comprobante.sunat_estado, 'aceptado')
    assert.equal(await stock(e.producto.id), 8)
    // La boleta lleva código y unidad del producto
    assert.equal(falsa.llamadas[0].cuerpo.items[0].codigo, e.producto.codigo)
    assert.equal(falsa.llamadas[0].cuerpo.cliente.razon_social, 'CLIENTES VARIOS')

    const detalle = await client
      .get(`/api/v1/ventas/${r.body().venta.id}`)
      .loginAs(e.admin)
      .headers(h(e.empresa))
    assert.lengthOf(detalle.body().items, 2)
    assert.lengthOf(detalle.body().pagos, 2)
    assert.equal(detalle.body().comprobante.numero_completo, 'B001-1')

    const lista = await client
      .get('/api/v1/ventas?buscar=B001-1&estado=completada&desde=2000-01-01&hasta=2999-12-31')
      .loginAs(e.admin)
      .headers(h(e.empresa))
    assert.equal(lista.body().meta.total, 1)
    const porCliente = await client
      .get('/api/v1/ventas?buscar=CLIENTES')
      .loginAs(e.admin)
      .headers(h(e.empresa))
    assert.equal(porCliente.body().meta.total, 1)
  })

  test('factura con cliente registrado', async ({ client, assert }) => {
    const falsa = new SunatFalsa()
      .cuando(
        'POST /facturas',
        exito(comprobanteApi({ tipo_documento: '01', numero_completo: 'F001-1' }), 201)
      )
      .instalar()
    const e = await escenario()
    await cargarStock(client, e)
    const r = await client
      .post('/api/v1/ventas')
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json({
        tipo_documento: '01',
        cliente_id: e.cliente.id,
        moneda: 'PEN',
        forma_pago: 'Contado',
        items: [{ producto_id: e.producto.id, cantidad: 1 }],
        pagos: [{ metodo: 'tarjeta', monto: 23.6, referencia: 'VISA 1234' }],
      })
    r.assertStatus(201)
    assert.equal(falsa.llamadas[0].cuerpo.cliente.num_doc, '20512345678')
    ;(
      await client
        .post('/api/v1/ventas')
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json({
          tipo_documento: '01',
          cliente_id: 999999,
          moneda: 'PEN',
          forma_pago: 'Contado',
          items: [{ producto_id: e.producto.id, cantidad: 1 }],
          pagos: [{ metodo: 'efectivo', monto: 30 }],
        })
    ).assertStatus(422)
  })

  test('valida pagos: insuficiente, vuelto electrónico y sin pagos', async ({ client, assert }) => {
    const falsa = new SunatFalsa().instalar()
    const e = await escenario()
    await cargarStock(client, e)
    const base = {
      tipo_documento: '03',
      moneda: 'PEN',
      forma_pago: 'Contado',
      items: [{ producto_id: e.producto.id, cantidad: 1 }],
    }
    ;(
      await client
        .post('/api/v1/ventas')
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json({ ...base, pagos: [{ metodo: 'efectivo', monto: 10 }] })
    ).assertStatus(422)
    ;(
      await client
        .post('/api/v1/ventas')
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json({ ...base, pagos: [{ metodo: 'yape', monto: 30 }] })
    ).assertStatus(422)
    ;(
      await client.post('/api/v1/ventas').loginAs(e.admin).headers(h(e.empresa)).json(base)
    ).assertStatus(422)
    ;(
      await client
        .post('/api/v1/ventas')
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json({
          ...base,
          forma_pago: 'Credito',
          cuotas: [{ monto: 23.6, fecha_pago: '2999-01-01' }],
          pagos: [{ metodo: 'efectivo', monto: 1 }],
        })
    ).assertStatus(422)
    assert.lengthOf(falsa.llamadas, 0)
    assert.equal(await stock(e.producto.id), 10)
  })

  test('sin stock suficiente no vende, salvo que la empresa lo permita', async ({
    client,
    assert,
  }) => {
    new SunatFalsa().cuando('POST /boletas', ...emisiones(3)).instalar()
    const e = await escenario()
    await cargarStock(client, e, 1)
    const venta = {
      tipo_documento: '03',
      moneda: 'PEN',
      forma_pago: 'Contado',
      items: [{ producto_id: e.producto.id, cantidad: 3 }],
      pagos: [{ metodo: 'efectivo', monto: 100 }],
    }
    const r = await client.post('/api/v1/ventas').loginAs(e.admin).headers(h(e.empresa)).json(venta)
    r.assertStatus(422)
    assert.include(r.body().mensaje, 'Stock insuficiente')
    assert.lengthOf(await Venta.query().where('empresa_id', e.empresa.id), 0)

    e.empresa.permitirVentaSinStock = true
    await e.empresa.save()
    ;(
      await client.post('/api/v1/ventas').loginAs(e.admin).headers(h(e.empresa)).json(venta)
    ).assertStatus(201)
    assert.equal(await stock(e.producto.id), -2)
  })

  test('descuentos y precio menor requieren permiso ventas.descuento', async ({
    client,
    assert,
  }) => {
    new SunatFalsa().cuando('POST /boletas', ...emisiones(5)).instalar()
    const e = await escenario()
    await cargarStock(client, e)
    const vendedor = await crearUsuario()
    await asignarRol(vendedor, e.empresa, 'Vendedor')
    const conDescuento = {
      tipo_documento: '03',
      moneda: 'PEN',
      forma_pago: 'Contado',
      items: [{ producto_id: e.producto.id, cantidad: 2, descuento: 7.2 }],
      pagos: [{ metodo: 'efectivo', monto: 40 }],
    }
    ;(
      await client.post('/api/v1/ventas').loginAs(vendedor).headers(h(e.empresa)).json(conDescuento)
    ).assertStatus(422)
    ;(
      await client
        .post('/api/v1/ventas')
        .loginAs(vendedor)
        .headers(h(e.empresa))
        .json({
          ...conDescuento,
          items: [{ producto_id: e.producto.id, cantidad: 1, precio_unitario: 10 }],
        })
    ).assertStatus(422)
    ;(
      await client
        .post('/api/v1/ventas')
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json({
          ...conDescuento,
          items: [{ producto_id: e.producto.id, cantidad: 1, descuento: 100 }],
        })
    ).assertStatus(422)
    const ok = await client
      .post('/api/v1/ventas')
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json(conDescuento)
    ok.assertStatus(201)
    assert.equal(ok.body().venta.total, 40)
    assert.equal(ok.body().venta.total_descuentos, 7.2)
    // Un precio mayor al de lista no requiere permiso
    ;(
      await client
        .post('/api/v1/ventas')
        .loginAs(vendedor)
        .headers(h(e.empresa))
        .json({
          ...conDescuento,
          items: [{ producto_id: e.producto.id, cantidad: 1, precio_unitario: 30 }],
        })
    ).assertStatus(201)
  })

  test('si SUNAT rechaza por validación, la venta se revierte y el stock vuelve', async ({
    client,
    assert,
  }) => {
    new SunatFalsa()
      .cuando('POST /boletas', {
        status: 422,
        cuerpo: {
          estado: 'error',
          mensaje: 'Error de validación',
          errores: { 'items.0.unidad': ['inválida'] },
        },
      })
      .instalar()
    const e = await escenario()
    await cargarStock(client, e)
    const r = await client
      .post('/api/v1/ventas')
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json({
        tipo_documento: '03',
        moneda: 'PEN',
        forma_pago: 'Contado',
        items: [{ producto_id: e.producto.id, cantidad: 2 }],
        pagos: [{ metodo: 'efectivo', monto: 50 }],
      })
    r.assertStatus(422)
    assert.equal(await stock(e.producto.id), 10)
    const venta = await Venta.query().where('empresa_id', e.empresa.id).firstOrFail()
    assert.equal(venta.estado, 'anulada')
    const motivos = (
      await MovimientoKardex.query().where('producto_id', e.producto.id).orderBy('id')
    ).map((m) => m.motivo)
    assert.deepEqual(motivos, ['inventario_inicial', 'venta', 'anulacion_venta'])
  })

  test('caída de la API: la venta queda y el comprobante se reintenta', async ({
    client,
    assert,
  }) => {
    new SunatFalsa().cuando('POST /boletas', { error: new TypeError('fetch failed') }).instalar()
    const e = await escenario()
    await cargarStock(client, e)
    const r = await client
      .post('/api/v1/ventas')
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json({
        tipo_documento: '03',
        moneda: 'PEN',
        forma_pago: 'Contado',
        items: [{ producto_id: e.producto.id, cantidad: 1 }],
        pagos: [{ metodo: 'efectivo', monto: 30 }],
      })
    r.assertStatus(201)
    assert.equal(r.body().comprobante.sunat_estado, 'error_envio')
    assert.equal(r.body().venta.estado, 'completada')
    assert.equal(await stock(e.producto.id), 9)
  })

  test('venta al crédito genera cuotas; cobros parciales y totales', async ({ client, assert }) => {
    const falsa = new SunatFalsa()
      .cuando('POST /facturas', exito(comprobanteApi({ tipo_documento: '01' }), 201))
      .instalar()
    const e = await escenario()
    await cargarStock(client, e)
    const r = await client
      .post('/api/v1/ventas')
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json({
        tipo_documento: '01',
        cliente_id: e.cliente.id,
        moneda: 'PEN',
        forma_pago: 'Credito',
        cuotas: [
          { monto: 23.6, fecha_pago: '2000-01-01' },
          { monto: 23.6, fecha_pago: '2999-01-01' },
        ],
        items: [{ producto_id: e.producto.id, cantidad: 2 }],
      })
    r.assertStatus(201)
    assert.lengthOf(falsa.llamadas[0].cuerpo.cuotas, 2)

    const cxc = await client
      .get('/api/v1/cuentas-por-cobrar?buscar=ACME')
      .loginAs(e.admin)
      .headers(h(e.empresa))
    assert.equal(cxc.body().meta.total, 2)
    assert.deepEqual(cxc.body().resumen, [{ moneda: 'PEN', saldo: 47.2, vencido: 23.6 }])
    const primera = cxc.body().data[0]
    ;(
      await client
        .post(`/api/v1/cuentas-por-cobrar/${primera.id}/cobros`)
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json({ monto: 50, metodo: 'efectivo' })
    ).assertStatus(422)
    const parcial = await client
      .post(`/api/v1/cuentas-por-cobrar/${primera.id}/cobros`)
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json({ monto: 10, metodo: 'yape' })
    assert.equal(parcial.body().estado, 'parcial')
    const total = await client
      .post(`/api/v1/cuentas-por-cobrar/${primera.id}/cobros`)
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json({ monto: 13.6, metodo: 'transferencia', referencia: 'OP 123' })
    assert.equal(total.body().estado, 'pagada')
    ;(
      await client
        .post(`/api/v1/cuentas-por-cobrar/${primera.id}/cobros`)
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json({ monto: 1, metodo: 'efectivo' })
    ).assertStatus(422)
    const pagadas = await client
      .get('/api/v1/cuentas-por-cobrar?estado=pagada')
      .loginAs(e.admin)
      .headers(h(e.empresa))
    assert.equal(pagadas.body().meta.total, 1)
  })
})

test.group('Caja: apertura, ventas, movimientos y cierre', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.teardown(() => SunatGateway.usar(null))

  test('flujo completo con arqueo', async ({ client, assert }) => {
    new SunatFalsa()
      .cuando('POST /boletas', ...emisiones(5))
      .cuando('POST /facturas', ...emisiones(2, 'F001', '01'))
      .instalar()
    const e = await escenario()
    await cargarStock(client, e)
    const venta = {
      tipo_documento: '03',
      caja_id: e.caja.id,
      moneda: 'PEN',
      forma_pago: 'Contado',
      items: [{ producto_id: e.producto.id, cantidad: 1 }],
      pagos: [{ metodo: 'efectivo', monto: 30 }],
    }

    ;(
      await client.post('/api/v1/ventas').loginAs(e.admin).headers(h(e.empresa)).json(venta)
    ).assertStatus(422) // caja cerrada

    const ap = await client
      .post('/api/v1/cajas/aperturas')
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json({ caja_id: e.caja.id, monto_inicial: 100 })
    ap.assertStatus(201)
    ;(
      await client
        .post('/api/v1/cajas/aperturas')
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json({ caja_id: e.caja.id, monto_inicial: 0 })
    ).assertStatus(422)
    ;(
      await client
        .post('/api/v1/cajas/aperturas')
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json({ caja_id: 999999, monto_inicial: 0 })
    ).assertStatus(422)

    const cajas = await client.get('/api/v1/cajas').loginAs(e.admin).headers(h(e.empresa))
    assert.equal(cajas.body()[0].apertura.id, ap.body().id)
    ;(
      await client.post('/api/v1/ventas').loginAs(e.admin).headers(h(e.empresa)).json(venta)
    ).assertStatus(201) // +23.6 efectivo (30 - 6.4 vuelto)
    ;(
      await client
        .post('/api/v1/ventas')
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json({ ...venta, pagos: [{ metodo: 'yape', monto: 23.6 }] })
    ).assertStatus(201)

    // Venta al crédito y cobro que ingresa a caja
    await client
      .post('/api/v1/ventas')
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json({
        tipo_documento: '01',
        cliente_id: e.cliente.id,
        caja_id: e.caja.id,
        moneda: 'PEN',
        forma_pago: 'Credito',
        cuotas: [{ monto: 23.6, fecha_pago: '2999-01-01' }],
        items: [{ producto_id: e.producto.id, cantidad: 1 }],
      })
    const cuota = await CuentaCobrar.query().where('empresa_id', e.empresa.id).firstOrFail()
    await client
      .post(`/api/v1/cuentas-por-cobrar/${cuota.id}/cobros`)
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json({ monto: 10, metodo: 'efectivo', caja_id: e.caja.id })

    const id = ap.body().id
    ;(
      await client
        .post(`/api/v1/cajas/aperturas/${id}/movimientos`)
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json({ tipo: 'egreso', concepto: 'Compra de bolsas', monto: 1000 })
    ).assertStatus(422)
    ;(
      await client
        .post(`/api/v1/cajas/aperturas/${id}/movimientos`)
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json({ tipo: 'egreso', concepto: 'Compra de bolsas', monto: 5 })
    ).assertStatus(201)
    ;(
      await client
        .post(`/api/v1/cajas/aperturas/${id}/movimientos`)
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json({ tipo: 'ingreso', concepto: 'Sencillo', monto: 20 })
    ).assertStatus(201)

    const resumen = await client
      .get(`/api/v1/cajas/aperturas/${id}`)
      .loginAs(e.admin)
      .headers(h(e.empresa))
    // 100 + 23.6 + 10 + 20 - 5
    assert.equal(resumen.body().efectivo_esperado, 148.6)
    assert.equal(resumen.body().por_metodo.yape.ingresos, 23.6)
    assert.lengthOf(resumen.body().movimientos, 5)

    const cierre = await client
      .post(`/api/v1/cajas/aperturas/${id}/cerrar`)
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json({ monto_declarado: 150, observacion: 'Sobrante' })
    assert.equal(cierre.body().diferencia, 1.4)
    assert.equal(cierre.body().estado, 'cerrada')
    ;(
      await client
        .post(`/api/v1/cajas/aperturas/${id}/cerrar`)
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json({ monto_declarado: 1 })
    ).assertStatus(422)
    ;(
      await client
        .post(`/api/v1/cajas/aperturas/${id}/movimientos`)
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json({ tipo: 'ingreso', concepto: 'Tarde', monto: 1 })
    ).assertStatus(422)

    const historial = await client
      .get('/api/v1/cajas/aperturas')
      .loginAs(e.admin)
      .headers(h(e.empresa))
    assert.equal(historial.body().meta.total, 1)
  })

  test('un Vendedor puede vender sin caja pero no abrirla', async ({ client }) => {
    new SunatFalsa().cuando('POST /boletas', ...emisiones(3)).instalar()
    const e = await escenario()
    await cargarStock(client, e)
    const vendedor = await crearUsuario()
    await asignarRol(vendedor, e.empresa, 'Vendedor')
    ;(
      await client
        .post('/api/v1/cajas/aperturas')
        .loginAs(vendedor)
        .headers(h(e.empresa))
        .json({ caja_id: e.caja.id, monto_inicial: 0 })
    ).assertStatus(403)
    ;(
      await client
        .post('/api/v1/ventas')
        .loginAs(vendedor)
        .headers(h(e.empresa))
        .json({
          tipo_documento: '03',
          moneda: 'PEN',
          forma_pago: 'Contado',
          items: [{ producto_id: e.producto.id, cantidad: 1 }],
          pagos: [{ metodo: 'efectivo', monto: 30 }],
        })
    ).assertStatus(201)
    ;(
      await client
        .post('/api/v1/ventas')
        .loginAs(vendedor)
        .headers(h(e.empresa))
        .json({
          tipo_documento: '03',
          almacen_id: e.almacen.id,
          moneda: 'PEN',
          forma_pago: 'Contado',
          items: [{ producto_id: e.producto.id, cantidad: 1 }],
          pagos: [{ metodo: 'efectivo', monto: 30 }],
        })
    ).assertStatus(201)
  })
})
