import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Almacen from '#models/almacen'
import Empresa from '#models/empresa'
import MovimientoKardex from '#models/movimiento_kardex'
import Stock from '#models/stock'
import Sucursal from '#models/sucursal'
import CuentaPagar from '#models/cuenta_pagar'
import { asignarRol, crearEmpresa, crearUsuario, datosInventario } from '#tests/helpers'

const h = (e: Empresa) => ({ 'x-empresa-id': String(e.id) })
const hoy = new Date().toISOString().slice(0, 10)

async function escenario() {
  const admin = await crearUsuario()
  const empresa = await crearEmpresa(admin)
  return { admin, empresa, ...(await datosInventario(empresa)) }
}

async function stockDe(productoId: number, almacenId: number) {
  const s = await Stock.query().where({ productoId, almacenId }).first()
  return s ? { cantidad: s.cantidad, costo: s.costoPromedio } : { cantidad: 0, costo: 0 }
}

test.group('Catálogo: categorías, productos, clientes y proveedores', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('crea categoría y producto; impide códigos duplicados', async ({ client, assert }) => {
    const { admin, empresa } = await escenario()
    const cat = await client
      .post('/api/v1/categorias')
      .loginAs(admin)
      .headers(h(empresa))
      .json({ nombre: 'Abarrotes' })
    cat.assertStatus(201)
    ;(
      await client
        .post('/api/v1/categorias')
        .loginAs(admin)
        .headers(h(empresa))
        .json({ nombre: 'abarrotes' })
    ).assertStatus(422)
    const editada = await client
      .put(`/api/v1/categorias/${cat.body().id}`)
      .loginAs(admin)
      .headers(h(empresa))
      .json({ nombre: 'Abarrotes y más' })
    assert.equal(editada.body().nombre, 'Abarrotes y más')

    const datos = {
      codigo: 'az-01',
      nombre: 'Azúcar 1kg',
      categoria_id: cat.body().id,
      unidad: 'NIU',
      tip_afe_igv: '10',
      controla_stock: true,
      precio_venta: 4.5,
    }
    const p = await client.post('/api/v1/productos').loginAs(admin).headers(h(empresa)).json(datos)
    p.assertStatus(201)
    assert.equal(p.body().codigo, 'AZ-01')
    ;(
      await client.post('/api/v1/productos').loginAs(admin).headers(h(empresa)).json(datos)
    ).assertStatus(422)
    ;(
      await client
        .post('/api/v1/productos')
        .loginAs(admin)
        .headers(h(empresa))
        .json({ ...datos, codigo: 'X1', categoria_id: 999999 })
    ).assertStatus(422)

    const servicio = await client
      .post('/api/v1/productos')
      .loginAs(admin)
      .headers(h(empresa))
      .json({ ...datos, codigo: 'SRV', unidad: 'ZZ', controla_stock: true })
    assert.isFalse(servicio.body().controla_stock)

    const edit = await client
      .put(`/api/v1/productos/${p.body().id}`)
      .loginAs(admin)
      .headers(h(empresa))
      .json({ ...datos, precio_venta: 5 })
    assert.equal(edit.body().precio_venta, 5)
    const lista = await client
      .get('/api/v1/productos?buscar=AZ-01&estado=activos')
      .loginAs(admin)
      .headers(h(empresa))
    assert.equal(lista.body().meta.total, 1)
    const cats = await client.get('/api/v1/categorias').loginAs(admin).headers(h(empresa))
    assert.lengthOf(cats.body(), 1)
  })

  test('clientes y proveedores validan documento y duplicados', async ({ client, assert }) => {
    const { admin, empresa } = await escenario()
    const base = { tipo_doc: '6', num_doc: '20600000001', razon_social: 'NUEVO PROVEEDOR SAC' }
    ;(
      await client
        .post('/api/v1/proveedores')
        .loginAs(admin)
        .headers(h(empresa))
        .json({ ...base, num_doc: '123' })
    ).assertStatus(422)
    const p = await client.post('/api/v1/proveedores').loginAs(admin).headers(h(empresa)).json(base)
    p.assertStatus(201)
    ;(
      await client.post('/api/v1/proveedores').loginAs(admin).headers(h(empresa)).json(base)
    ).assertStatus(422)
    const e = await client
      .put(`/api/v1/proveedores/${p.body().id}`)
      .loginAs(admin)
      .headers(h(empresa))
      .json({ ...base, telefono: '999' })
    assert.equal(e.body().telefono, '999')
    ;(
      await client
        .post('/api/v1/clientes')
        .loginAs(admin)
        .headers(h(empresa))
        .json({ tipo_doc: '1', num_doc: '12', razon_social: 'Juan' })
    ).assertStatus(422)
    const c = await client
      .post('/api/v1/clientes')
      .loginAs(admin)
      .headers(h(empresa))
      .json({ tipo_doc: '1', num_doc: '45678912', razon_social: 'Juan Pérez' })
    c.assertStatus(201)
    const sinDoc = await client
      .post('/api/v1/clientes')
      .loginAs(admin)
      .headers(h(empresa))
      .json({ tipo_doc: '0', num_doc: '-', razon_social: 'Mostrador' })
    sinDoc.assertStatus(201)
    await client
      .put(`/api/v1/clientes/${c.body().id}`)
      .loginAs(admin)
      .headers(h(empresa))
      .json({ tipo_doc: '1', num_doc: '45678912', razon_social: 'Juan P.' })
    const lista = await client
      .get('/api/v1/clientes?buscar=4567&estado=activos')
      .loginAs(admin)
      .headers(h(empresa))
    assert.equal(lista.body().meta.total, 1)
    const provs = await client
      .get('/api/v1/proveedores?buscar=NUEVO')
      .loginAs(admin)
      .headers(h(empresa))
    assert.equal(provs.body().meta.total, 1)
  })

  test('un Vendedor ve productos pero no puede crearlos', async ({ client }) => {
    const { empresa } = await escenario()
    const vendedor = await crearUsuario()
    await asignarRol(vendedor, empresa, 'Vendedor')
    ;(await client.get('/api/v1/productos').loginAs(vendedor).headers(h(empresa))).assertStatus(200)
    ;(
      await client.post('/api/v1/productos').loginAs(vendedor).headers(h(empresa)).json({})
    ).assertStatus(403)
  })
})

test.group('Inventario: ajustes, transferencias y kardex', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('inventario inicial, merma y stock insuficiente', async ({ client, assert }) => {
    const { admin, empresa, almacen, producto, servicio } = await escenario()
    const entradaSinCosto = await client
      .post('/api/v1/inventario/ajustes')
      .loginAs(admin)
      .headers(h(empresa))
      .json({
        almacen_id: almacen.id,
        tipo: 'entrada',
        motivo: 'inventario_inicial',
        items: [{ producto_id: producto.id, cantidad: 10 }],
      })
    entradaSinCosto.assertStatus(422)

    const r = await client
      .post('/api/v1/inventario/ajustes')
      .loginAs(admin)
      .headers(h(empresa))
      .json({
        almacen_id: almacen.id,
        tipo: 'entrada',
        motivo: 'inventario_inicial',
        items: [{ producto_id: producto.id, cantidad: 10, costo_unitario: 15 }],
      })
    r.assertStatus(201)
    assert.deepEqual(await stockDe(producto.id, almacen.id), { cantidad: 10, costo: 15 })

    await client
      .post('/api/v1/inventario/ajustes')
      .loginAs(admin)
      .headers(h(empresa))
      .json({
        almacen_id: almacen.id,
        tipo: 'salida',
        motivo: 'merma',
        observacion: 'Bolsas rotas',
        items: [{ producto_id: producto.id, cantidad: 2 }],
      })
    await client
      .post('/api/v1/inventario/ajustes')
      .loginAs(admin)
      .headers(h(empresa))
      .json({
        almacen_id: almacen.id,
        tipo: 'salida',
        motivo: 'ajuste',
        items: [{ producto_id: producto.id, cantidad: 1 }],
      })
    assert.equal((await stockDe(producto.id, almacen.id)).cantidad, 7)

    const exceso = await client
      .post('/api/v1/inventario/ajustes')
      .loginAs(admin)
      .headers(h(empresa))
      .json({
        almacen_id: almacen.id,
        tipo: 'salida',
        motivo: 'ajuste',
        items: [{ producto_id: producto.id, cantidad: 50 }],
      })
    exceso.assertStatus(422)
    assert.include(exceso.body().mensaje, 'Stock insuficiente')

    const deServicio = await client
      .post('/api/v1/inventario/ajustes')
      .loginAs(admin)
      .headers(h(empresa))
      .json({
        almacen_id: almacen.id,
        tipo: 'entrada',
        motivo: 'ajuste',
        items: [{ producto_id: servicio.id, cantidad: 1, costo_unitario: 1 }],
      })
    deServicio.assertStatus(422)

    const kardex = await client
      .get(
        `/api/v1/inventario/kardex?producto_id=${producto.id}&almacen_id=${almacen.id}&desde=2000-01-01&hasta=2999-12-31`
      )
      .loginAs(admin)
      .headers(h(empresa))
    assert.equal(kardex.body().meta.total, 3)
    const motivos = kardex.body().data.map((m: any) => m.motivo)
    assert.deepEqual(motivos, ['ajuste_salida', 'merma', 'inventario_inicial'])

    const lista = await client
      .get(`/api/v1/productos?almacen_id=${almacen.id}`)
      .loginAs(admin)
      .headers(h(empresa))
    const fila = lista.body().data.find((p: any) => p.id === producto.id)
    assert.equal(fila.stock, 7)
    assert.equal(fila.valor_stock, 105)
    const detalle = await client
      .get(`/api/v1/productos/${producto.id}`)
      .loginAs(admin)
      .headers(h(empresa))
    assert.equal(detalle.body().stock[0].cantidad, 7)
  })

  test('almacén o producto ajeno se rechaza', async ({ client }) => {
    const { admin, empresa, producto } = await escenario()
    const otro = await escenario()
    ;(
      await client
        .post('/api/v1/inventario/ajustes')
        .loginAs(admin)
        .headers(h(empresa))
        .json({
          almacen_id: otro.almacen.id,
          tipo: 'entrada',
          motivo: 'ajuste',
          items: [{ producto_id: producto.id, cantidad: 1, costo_unitario: 1 }],
        })
    ).assertStatus(422)
    const almacen = await Almacen.query().where('empresa_id', empresa.id).firstOrFail()
    ;(
      await client
        .post('/api/v1/inventario/ajustes')
        .loginAs(admin)
        .headers(h(empresa))
        .json({
          almacen_id: almacen.id,
          tipo: 'entrada',
          motivo: 'ajuste',
          items: [{ producto_id: otro.producto.id, cantidad: 1, costo_unitario: 1 }],
        })
    ).assertStatus(422)
  })

  test('transferencia entre almacenes conserva el costo', async ({ client, assert }) => {
    const { admin, empresa, almacen, producto } = await escenario()
    const sucursal = await Sucursal.query().where('empresa_id', empresa.id).firstOrFail()
    const destino = await Almacen.create({
      empresaId: empresa.id,
      sucursalId: sucursal.id,
      nombre: 'Almacén 2',
      activo: true,
    })
    await client
      .post('/api/v1/inventario/ajustes')
      .loginAs(admin)
      .headers(h(empresa))
      .json({
        almacen_id: almacen.id,
        tipo: 'entrada',
        motivo: 'inventario_inicial',
        items: [{ producto_id: producto.id, cantidad: 10, costo_unitario: 8 }],
      })
    ;(
      await client
        .post('/api/v1/inventario/transferencias')
        .loginAs(admin)
        .headers(h(empresa))
        .json({
          almacen_origen_id: almacen.id,
          almacen_destino_id: almacen.id,
          items: [{ producto_id: producto.id, cantidad: 1 }],
        })
    ).assertStatus(422)
    const r = await client
      .post('/api/v1/inventario/transferencias')
      .loginAs(admin)
      .headers(h(empresa))
      .json({
        almacen_origen_id: almacen.id,
        almacen_destino_id: destino.id,
        items: [{ producto_id: producto.id, cantidad: 4 }],
      })
    r.assertStatus(201)
    assert.deepEqual(await stockDe(producto.id, almacen.id), { cantidad: 6, costo: 8 })
    assert.deepEqual(await stockDe(producto.id, destino.id), { cantidad: 4, costo: 8 })
    const almacenes = await client.get('/api/v1/almacenes').loginAs(admin).headers(h(empresa))
    assert.lengthOf(almacenes.body(), 2)
  })
})

test.group('Compras, órdenes de compra y cuentas por pagar', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  const compraBase = (
    e: Awaited<ReturnType<typeof escenario>>,
    cambios: Record<string, unknown> = {}
  ) => ({
    proveedor_id: e.proveedor.id,
    almacen_id: e.almacen.id,
    tipo_documento: '01',
    serie: 'F001',
    numero: '123',
    fecha_emision: hoy,
    moneda: 'PEN',
    forma_pago: 'Contado',
    items: [
      { producto_id: e.producto.id, cantidad: 10, precio_unitario: 11.8 },
      { producto_id: e.servicio.id, cantidad: 1, precio_unitario: 5.9 },
    ],
    ...cambios,
  })

  test('compra al contado: stock al costo sin IGV, promedio y CxP pagada', async ({
    client,
    assert,
  }) => {
    const e = await escenario()
    const r = await client
      .post('/api/v1/compras')
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json(compraBase(e))
    r.assertStatus(201)
    assert.equal(r.body().total, 123.9)
    assert.equal(r.body().total_igv, 18.9)
    assert.deepEqual(await stockDe(e.producto.id, e.almacen.id), { cantidad: 10, costo: 10 })
    // El servicio no mueve kardex
    assert.lengthOf(await MovimientoKardex.query().where('producto_id', e.servicio.id), 0)

    await client
      .post('/api/v1/compras')
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json(
        compraBase(e, {
          numero: '124',
          items: [{ producto_id: e.producto.id, cantidad: 10, precio_unitario: 14.16 }],
        })
      )
    assert.deepEqual(await stockDe(e.producto.id, e.almacen.id), { cantidad: 20, costo: 11 })

    const cuota = await CuentaPagar.query().where('compra_id', r.body().id).firstOrFail()
    assert.equal(cuota.estado, 'pagada')

    const dup = await client
      .post('/api/v1/compras')
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json(compraBase(e))
    dup.assertStatus(422)

    const lista = await client
      .get('/api/v1/compras?buscar=F001-12&estado=registrada&desde=2000-01-01&hasta=2999-12-31')
      .loginAs(e.admin)
      .headers(h(e.empresa))
    assert.equal(lista.body().meta.total, 2)
    const porProveedor = await client
      .get('/api/v1/compras?buscar=DISTRIBUIDORA')
      .loginAs(e.admin)
      .headers(h(e.empresa))
    assert.equal(porProveedor.body().meta.total, 2)
    const detalle = await client
      .get(`/api/v1/compras/${r.body().id}`)
      .loginAs(e.admin)
      .headers(h(e.empresa))
    assert.lengthOf(detalle.body().items, 2)
  })

  test('compra en dólares exige tipo de cambio y convierte el costo', async ({
    client,
    assert,
  }) => {
    const e = await escenario()
    ;(
      await client
        .post('/api/v1/compras')
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json(compraBase(e, { moneda: 'USD' }))
    ).assertStatus(422)
    const r = await client
      .post('/api/v1/compras')
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json(compraBase(e, { moneda: 'USD', tipo_cambio: 3.75 }))
    r.assertStatus(201)
    assert.deepEqual(await stockDe(e.producto.id, e.almacen.id), { cantidad: 10, costo: 37.5 })
  })

  test('compra al crédito genera cuotas; pagos parciales y totales', async ({ client, assert }) => {
    const e = await escenario()
    const malas = await client
      .post('/api/v1/compras')
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json(
        compraBase(e, { forma_pago: 'Credito', cuotas: [{ monto: 10, fecha_vencimiento: hoy }] })
      )
    malas.assertStatus(422)
    const r = await client
      .post('/api/v1/compras')
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json(
        compraBase(e, {
          forma_pago: 'Credito',
          cuotas: [
            { monto: 60, fecha_vencimiento: '2000-01-01' },
            { monto: 63.9, fecha_vencimiento: '2999-01-31' },
          ],
        })
      )
    r.assertStatus(201)
    const conDias = await client
      .post('/api/v1/compras')
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json(compraBase(e, { numero: '999', forma_pago: 'Credito', dias_credito: 15 }))
    conDias.assertStatus(201)

    const cxp = await client.get('/api/v1/cuentas-por-pagar').loginAs(e.admin).headers(h(e.empresa))
    assert.equal(cxp.body().meta.total, 3)
    assert.deepEqual(cxp.body().resumen, [{ moneda: 'PEN', saldo: 247.8, vencido: 60 }])

    const primera = cxp.body().data[0]
    ;(
      await client
        .post(`/api/v1/cuentas-por-pagar/${primera.id}/pagos`)
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json({ monto: 100, metodo: 'transferencia' })
    ).assertStatus(422)
    const parcial = await client
      .post(`/api/v1/cuentas-por-pagar/${primera.id}/pagos`)
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json({ monto: 20, metodo: 'yape', fecha: hoy })
    assert.equal(parcial.body().estado, 'parcial')
    const total = await client
      .post(`/api/v1/cuentas-por-pagar/${primera.id}/pagos`)
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json({ monto: 40, metodo: 'efectivo', referencia: 'Recibo 1' })
    assert.equal(total.body().estado, 'pagada')
    ;(
      await client
        .post(`/api/v1/cuentas-por-pagar/${primera.id}/pagos`)
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json({ monto: 1, metodo: 'efectivo' })
    ).assertStatus(422)

    // Con pagos registrados no se puede anular
    ;(
      await client
        .post(`/api/v1/compras/${r.body().id}/anular`)
        .loginAs(e.admin)
        .headers(h(e.empresa))
    ).assertStatus(422)
    const pagadas = await client
      .get('/api/v1/cuentas-por-pagar?estado=pagada')
      .loginAs(e.admin)
      .headers(h(e.empresa))
    assert.equal(pagadas.body().meta.total, 1)
  })

  test('anular compra retira el stock; falla si ya se consumió', async ({ client, assert }) => {
    const e = await escenario()
    const r = await client
      .post('/api/v1/compras')
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json(compraBase(e))
    const anulada = await client
      .post(`/api/v1/compras/${r.body().id}/anular`)
      .loginAs(e.admin)
      .headers(h(e.empresa))
    anulada.assertStatus(200)
    assert.equal(anulada.body().estado, 'anulada')
    assert.equal((await stockDe(e.producto.id, e.almacen.id)).cantidad, 0)
    ;(
      await client
        .post(`/api/v1/compras/${r.body().id}/anular`)
        .loginAs(e.admin)
        .headers(h(e.empresa))
    ).assertStatus(422)

    const r2 = await client
      .post('/api/v1/compras')
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json(compraBase(e, { numero: '200' }))
    await client
      .post('/api/v1/inventario/ajustes')
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json({
        almacen_id: e.almacen.id,
        tipo: 'salida',
        motivo: 'merma',
        items: [{ producto_id: e.producto.id, cantidad: 5 }],
      })
    ;(
      await client
        .post(`/api/v1/compras/${r2.body().id}/anular`)
        .loginAs(e.admin)
        .headers(h(e.empresa))
    ).assertStatus(422)

    const r3 = await client
      .post('/api/v1/compras')
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json(compraBase(e, { numero: '300', forma_pago: 'Credito', dias_credito: 30 }))
    ;(
      await client
        .post(`/api/v1/compras/${r3.body().id}/anular`)
        .loginAs(e.admin)
        .headers(h(e.empresa))
    ).assertStatus(200)
  })

  test('órdenes de compra: numeración, aprobación, recepción y anulación', async ({
    client,
    assert,
  }) => {
    const e = await escenario()
    const oc = {
      proveedor_id: e.proveedor.id,
      almacen_id: e.almacen.id,
      fecha: hoy,
      fecha_entrega: hoy,
      moneda: 'PEN',
      items: [{ producto_id: e.producto.id, cantidad: 5, precio_unitario: 11.8 }],
    }
    const a = await client
      .post('/api/v1/ordenes-compra')
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json(oc)
    const b = await client
      .post('/api/v1/ordenes-compra')
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json(oc)
    assert.equal(a.body().numero, 1)
    assert.equal(b.body().numero, 2)
    assert.equal(a.body().total, 59)

    const sinAprobar = await client
      .post('/api/v1/compras')
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json(compraBase(e, { orden_compra_id: a.body().id }))
    sinAprobar.assertStatus(422)
    ;(
      await client
        .post(`/api/v1/ordenes-compra/${a.body().id}/aprobar`)
        .loginAs(e.admin)
        .headers(h(e.empresa))
    ).assertStatus(200)
    ;(
      await client
        .post(`/api/v1/ordenes-compra/${a.body().id}/aprobar`)
        .loginAs(e.admin)
        .headers(h(e.empresa))
    ).assertStatus(422)
    ;(
      await client
        .post('/api/v1/compras')
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json(compraBase(e, { orden_compra_id: a.body().id }))
    ).assertStatus(201)
    const recibida = await client
      .get(`/api/v1/ordenes-compra/${a.body().id}`)
      .loginAs(e.admin)
      .headers(h(e.empresa))
    assert.equal(recibida.body().estado, 'recibida')
    assert.lengthOf(recibida.body().items, 1)
    ;(
      await client
        .post(`/api/v1/ordenes-compra/${a.body().id}/anular`)
        .loginAs(e.admin)
        .headers(h(e.empresa))
    ).assertStatus(422)
    ;(
      await client
        .post(`/api/v1/ordenes-compra/${b.body().id}/anular`)
        .loginAs(e.admin)
        .headers(h(e.empresa))
    ).assertStatus(200)

    const lista = await client
      .get('/api/v1/ordenes-compra?estado=recibida,anulada')
      .loginAs(e.admin)
      .headers(h(e.empresa))
    assert.equal(lista.body().meta.total, 2)
  })

  test('proveedor ajeno se rechaza', async ({ client }) => {
    const e = await escenario()
    const otro = await escenario()
    ;(
      await client
        .post('/api/v1/compras')
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json(compraBase(e, { proveedor_id: otro.proveedor.id }))
    ).assertStatus(422)
    ;(
      await client
        .post('/api/v1/ordenes-compra')
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json({
          proveedor_id: otro.proveedor.id,
          almacen_id: e.almacen.id,
          fecha: hoy,
          moneda: 'PEN',
          items: [{ producto_id: e.producto.id, cantidad: 1, precio_unitario: 1 }],
        })
    ).assertStatus(422)
  })
})
