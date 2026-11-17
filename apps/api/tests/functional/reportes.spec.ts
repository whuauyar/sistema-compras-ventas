import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Empresa from '#models/empresa'
import { SunatGateway } from '#integrations/sunat/sunat_service'
import { aCsv, rangoPorDefecto } from '#services/reportes_service'
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
const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
const rango = `desde=2000-01-01&hasta=2999-12-31`

/** Escenario con compra, dos ventas (contado y crédito), una NC parcial aceptada y un rechazo. */
async function escenario(client: any) {
  new SunatFalsa()
    .cuando('POST /boletas', ...emisiones(2))
    .cuando('POST /facturas', ...emisiones(1, 'F001', '01'))
    .cuando(
      'POST /notas-credito',
      exito(
        comprobanteApi({
          id: 790,
          tipo_documento: '07',
          serie: 'BC01',
          numero_completo: 'BC01-1',
          sunat: { estado: 'aceptado' },
        }),
        201
      )
    )
    .instalar()
  const admin = await crearUsuario({ nombreCompleto: 'Ana Ventas' })
  const empresa = await crearEmpresa(admin)
  const d = await datosInventario(empresa)
  const H = h(empresa)
  ;(
    await client
      .post('/api/v1/compras')
      .loginAs(admin)
      .headers(H)
      .json({
        proveedor_id: d.proveedor.id,
        almacen_id: d.almacen.id,
        tipo_documento: '01',
        serie: 'F001',
        numero: '1',
        fecha_emision: hoy,
        moneda: 'PEN',
        forma_pago: 'Credito',
        dias_credito: 30,
        items: [{ producto_id: d.producto.id, cantidad: 10, precio_unitario: 11.8 }],
      })
  ).assertStatus(201)
  // Contado: 3 × 23.6 (base 60, costo 30)
  const v1 = await client
    .post('/api/v1/ventas')
    .loginAs(admin)
    .headers(H)
    .json({
      tipo_documento: '03',
      moneda: 'PEN',
      forma_pago: 'Contado',
      items: [{ producto_id: d.producto.id, cantidad: 3 }],
      pagos: [{ metodo: 'efectivo', monto: 70.8 }],
    })
  v1.assertStatus(201)
  // Crédito con factura: 2 × 23.6 + servicio 5.9
  ;(
    await client
      .post('/api/v1/ventas')
      .loginAs(admin)
      .headers(H)
      .json({
        tipo_documento: '01',
        cliente_id: d.cliente.id,
        moneda: 'PEN',
        forma_pago: 'Credito',
        cuotas: [{ monto: 53.1, fecha_pago: '2000-01-01' }],
        items: [
          { producto_id: d.producto.id, cantidad: 2 },
          { producto_id: d.servicio.id, cantidad: 1 },
        ],
      })
  ).assertStatus(201)
  // NC por 1 unidad de la boleta (repone stock)
  const venta = await client.get(`/api/v1/ventas/${v1.body().venta.id}`).loginAs(admin).headers(H)
  ;(
    await client
      .post(`/api/v1/comprobantes/${v1.body().comprobante.id}/nota-credito`)
      .loginAs(admin)
      .headers(H)
      .json({
        cod_motivo: '07',
        reponer_stock: true,
        items: [{ venta_item_id: venta.body().items[0].id, cantidad: 1 }],
      })
  ).assertStatus(201)
  return { admin, empresa, H, ...d }
}

test.group('Dashboard y reportes', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.teardown(() => SunatGateway.usar(null))

  test('dashboard: ventas, utilidad neta de devoluciones, saldos y alertas', async ({
    client,
    assert,
  }) => {
    const e = await escenario(client)
    const r = await client.get(`/api/v1/dashboard?${rango}`).loginAs(e.admin).headers(e.H)
    r.assertStatus(200)
    const d = r.body()
    assert.deepEqual(d.ventas, {
      total: 123.9,
      cantidad: 2,
      ticket_promedio: 61.95,
      notas_credito: 23.6,
    })
    // Base neta: (2 × 20) + (2 × 20) + 5 = 85; costo neto: (2 × 10) + (2 × 10) = 40
    assert.deepEqual(d.utilidad, { base: 85, costo: 40, bruta: 45, margen: 52.94 })
    assert.equal(d.compras.total, 118)
    assert.deepEqual(d.por_cobrar, { saldo: 53.1, vencido: 53.1 })
    assert.equal(d.por_pagar.saldo, 118)
    assert.lengthOf(d.ventas_por_dia, 1)
    assert.equal(d.top_productos[0].descripcion, 'Arroz 5kg')
    assert.equal(d.top_productos[0].cantidad, 4)
    assert.equal(d.top_clientes[0].razon_social, 'CLIENTES VARIOS')
    assert.equal(d.productos_bajo_minimo, 0)
    assert.deepEqual(d.sunat, { rechazados: 0, sin_conexion: 0, pendientes_1h: 0, anulando: 0 })
  })

  test('reportes de ventas por cada agrupación', async ({ client, assert }) => {
    const e = await escenario(client)
    const get = (q: string) =>
      client.get(`/api/v1/reportes/ventas?${rango}&${q}`).loginAs(e.admin).headers(e.H)
    const dia = await get('agrupar=dia')
    assert.equal(dia.body().filas[0].total, 123.9)
    assert.equal(dia.body().filas[0].costo, 50)
    const producto = await get('agrupar=producto')
    assert.deepEqual(
      producto.body().filas.find((f: any) => f.producto === 'Arroz 5kg'),
      { producto: 'Arroz 5kg', cantidad: 4, total: 94.4 }
    )
    const cliente = await get('agrupar=cliente')
    assert.lengthOf(cliente.body().filas, 2)
    const vendedor = await get('agrupar=vendedor')
    assert.equal(vendedor.body().filas[0].vendedor, 'Ana Ventas')
    const sucursal = await get('agrupar=sucursal')
    assert.equal(sucursal.body().filas[0].sucursal, 'Principal')
    const metodo = await get('agrupar=metodo_pago')
    assert.deepEqual(metodo.body().filas, [{ metodo: 'efectivo', operaciones: 1, total: 70.8 }])
  })

  test('compras, utilidad, inventario, kardex y registro de ventas', async ({ client, assert }) => {
    const e = await escenario(client)
    const get = (t: string, q = '') =>
      client.get(`/api/v1/reportes/${t}?${rango}${q}`).loginAs(e.admin).headers(e.H)

    assert.equal((await get('compras')).body().filas[0].total, 118)
    assert.equal(
      (await get('compras', '&agrupar=proveedor')).body().filas[0].proveedor,
      'DISTRIBUIDORA SAC'
    )
    assert.deepEqual((await get('compras', '&agrupar=producto')).body().filas[0], {
      producto: 'Arroz 5kg',
      cantidad: 10,
      costo: 100,
    })

    const utilidad = await get('utilidad')
    const arroz = utilidad.body().filas.find((f: any) => f.producto === 'Arroz 5kg')
    assert.deepEqual(arroz, {
      producto: 'Arroz 5kg',
      cantidad: 4,
      venta: 80,
      costo: 40,
      utilidad: 40,
      margen: 50,
    })

    const inventario = await get('inventario', `&almacen_id=${e.almacen.id}`)
    assert.deepEqual(inventario.body().filas[0], {
      codigo: e.producto.codigo,
      producto: 'Arroz 5kg',
      almacen: 'Almacén principal',
      cantidad: 6,
      costo_promedio: 10,
      valor: 60,
      alerta: '',
    })
    ;(await get('kardex')).assertStatus(422)
    const kardex = await get('kardex', `&producto_id=${e.producto.id}&almacen_id=${e.almacen.id}`)
    assert.deepEqual(
      kardex.body().filas.map((f: any) => f.motivo),
      ['compra', 'venta', 'venta', 'devolucion_venta']
    )
    assert.equal(kardex.body().filas.at(-1).saldo_cantidad, 6)

    const registro = await get('registro-ventas')
    const nc = registro.body().filas.find((f: any) => f.tipo_documento === '07')
    assert.equal(nc.total, -23.6)
    assert.lengthOf(registro.body().filas, 3)
    ;(await get('desconocido')).assertStatus(422)
  })

  test('exporta CSV compatible con Excel', async ({ client, assert }) => {
    const e = await escenario(client)
    const r = await client
      .get(`/api/v1/reportes/utilidad?${rango}&formato=csv`)
      .loginAs(e.admin)
      .headers(e.H)
    r.assertStatus(200)
    assert.include(r.header('content-type'), 'text/csv')
    assert.include(r.header('content-disposition'), 'utilidad-2000-01-01_2999-12-31.csv')
    assert.include(r.text(), 'Producto,Cantidad,Venta,Costo,Utilidad,Margen %')
  })

  test('aCsv escapa comas, comillas y saltos; vacíos para nulos', ({ assert }) => {
    const csv = aCsv({
      titulo: 'x',
      columnas: [
        { clave: 'a', titulo: 'A' },
        { clave: 'b', titulo: 'B' },
      ],
      filas: [
        { a: 'Hola, "mundo"', b: null },
        { a: 'línea\nnueva', b: 3 },
      ],
    })
    assert.equal(csv, '﻿A,B\r\n"Hola, ""mundo""",\r\n"línea\nnueva",3\r\n')
  })

  test('rango por defecto: mes actual', ({ assert }) => {
    const r = rangoPorDefecto()
    assert.match(r.desde, /^\d{4}-\d{2}-01$/)
    assert.deepEqual(rangoPorDefecto('2026-01-01', '2026-01-31'), {
      desde: '2026-01-01',
      hasta: '2026-01-31',
    })
  })

  test('solo roles con reportes.ver acceden', async ({ client }) => {
    const admin = await crearUsuario()
    const empresa = await crearEmpresa(admin)
    const vendedor = await crearUsuario()
    await asignarRol(vendedor, empresa, 'Vendedor')
    ;(await client.get('/api/v1/dashboard').loginAs(vendedor).headers(h(empresa))).assertStatus(403)
    ;(await client.get('/api/v1/dashboard').loginAs(admin).headers(h(empresa))).assertStatus(200)
  })
})
