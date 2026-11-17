import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import Comprobante from '#models/comprobante'
import CuentaCobrar from '#models/cuenta_cobrar'
import Empresa from '#models/empresa'
import Job from '#models/job'
import Stock from '#models/stock'
import Venta from '#models/venta'
import { SunatGateway } from '#integrations/sunat/sunat_service'
import { procesarLote } from '#services/cola_service'
import { programarReconsultas, registrarJobsSunat } from '#jobs/sunat_jobs'
import {
  SunatFalsa,
  asignarRol,
  comprobanteApi,
  crearEmpresa,
  crearUsuario,
  datosInventario,
  exito,
} from '#tests/helpers'

const h = (e: Empresa) => ({ 'x-empresa-id': String(e.id) })
const stock = async (productoId: number) =>
  (await Stock.query().where('producto_id', productoId).firstOrFail()).cantidad

/** Empresa con 10 unidades y una venta (boleta o factura) ya aceptada. */
async function conVenta(
  client: any,
  falsa: SunatFalsa,
  opciones: { tipo?: '01' | '03'; credito?: boolean; cantidad?: number } = {}
) {
  const admin = await crearUsuario()
  const empresa = await crearEmpresa(admin)
  const d = await datosInventario(empresa)
  const tipo = opciones.tipo ?? '03'
  const serie = tipo === '01' ? 'F001' : 'B001'
  falsa.cuando(
    `POST /${tipo === '01' ? 'facturas' : 'boletas'}`,
    exito(
      comprobanteApi({ id: 501, tipo_documento: tipo, serie, numero_completo: `${serie}-1` }),
      201
    )
  )
  falsa.instalar()
  await client
    .post('/api/v1/inventario/ajustes')
    .loginAs(admin)
    .headers(h(empresa))
    .json({
      almacen_id: d.almacen.id,
      tipo: 'entrada',
      motivo: 'inventario_inicial',
      items: [{ producto_id: d.producto.id, cantidad: 10, costo_unitario: 15 }],
    })
  const cantidad = opciones.cantidad ?? 3
  const total = Math.round(cantidad * 23.6 * 100) / 100
  const r = await client
    .post('/api/v1/ventas')
    .loginAs(admin)
    .headers(h(empresa))
    .json({
      tipo_documento: tipo,
      cliente_id: tipo === '01' ? d.cliente.id : undefined,
      moneda: 'PEN',
      forma_pago: opciones.credito ? 'Credito' : 'Contado',
      cuotas: opciones.credito ? [{ monto: total, fecha_pago: '2999-01-01' }] : undefined,
      items: [{ producto_id: d.producto.id, cantidad }],
      pagos: opciones.credito ? undefined : [{ metodo: 'efectivo', monto: total }],
    })
  r.assertStatus(201)
  const venta = await Venta.query().where('id', r.body().venta.id).preload('items').firstOrFail()
  return { admin, empresa, ...d, venta, comprobanteId: r.body().comprobante.id as number }
}

test.group('Notas de crédito y débito', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.teardown(() => SunatGateway.usar(null))

  test('NC por anulación total: arma el documento afectado, repone stock y anula la venta', async ({
    client,
    assert,
  }) => {
    const falsa = new SunatFalsa().cuando(
      'POST /notas-credito',
      exito(
        comprobanteApi({
          id: 701,
          tipo_documento: '07',
          serie: 'BC01',
          numero_completo: 'BC01-1',
          sunat: { estado: 'aceptado' },
        }),
        201
      )
    )
    const e = await conVenta(client, falsa)
    assert.equal(await stock(e.producto.id), 7)

    const r = await client
      .post(`/api/v1/comprobantes/${e.comprobanteId}/nota-credito`)
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json({ cod_motivo: '01', reponer_stock: true })
    r.assertStatus(201)
    const enviado = falsa.llamadas.find((l) => l.ruta === '/notas-credito')!.cuerpo
    assert.equal(enviado.serie, 'BC01')
    assert.equal(enviado.doc_afectado_tipo, '03')
    assert.equal(enviado.doc_afectado_serie, 'B001')
    assert.equal(enviado.doc_afectado_correlativo, 1)
    assert.equal(enviado.des_motivo, 'Anulación de la operación')
    assert.equal(enviado.items[0].cantidad, 3)

    assert.equal(await stock(e.producto.id), 10)
    await e.venta.refresh()
    assert.equal(e.venta.estado, 'anulada')
    const nota = await Comprobante.findOrFail(r.body().id)
    assert.isTrue(nota.stockAplicado)

    // No queda saldo por acreditar
    ;(
      await client
        .post(`/api/v1/comprobantes/${e.comprobanteId}/nota-credito`)
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json({ cod_motivo: '01' })
    ).assertStatus(422)

    const rel = await client
      .get(`/api/v1/comprobantes/${e.comprobanteId}/relacionados`)
      .loginAs(e.admin)
      .headers(h(e.empresa))
    assert.lengthOf(rel.body(), 1)
  })

  test('NC parcial: el stock se repone recién al ser aceptada', async ({ client, assert }) => {
    const falsa = new SunatFalsa()
      .cuando(
        'POST /notas-credito',
        exito(
          comprobanteApi({
            id: 702,
            tipo_documento: '07',
            serie: 'BC01',
            numero_completo: 'BC01-1',
            sunat: { estado: 'enviado' },
            totales: { total: 23.6 },
          }),
          201
        )
      )
      .cuando(
        'GET /notas-credito/702',
        exito(
          comprobanteApi({
            id: 702,
            tipo_documento: '07',
            sunat: { estado: 'aceptado' },
            totales: { total: 23.6 },
          })
        )
      )
    const e = await conVenta(client, falsa)
    const item = e.venta.items[0]

    ;(
      await client
        .post(`/api/v1/comprobantes/${e.comprobanteId}/nota-credito`)
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json({ cod_motivo: '07', items: [{ venta_item_id: item.id, cantidad: 5 }] })
    ).assertStatus(422)
    ;(
      await client
        .post(`/api/v1/comprobantes/${e.comprobanteId}/nota-credito`)
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json({ cod_motivo: '07', items: [{ venta_item_id: 999999, cantidad: 1 }] })
    ).assertStatus(422)
    ;(
      await client
        .post(`/api/v1/comprobantes/${e.comprobanteId}/nota-credito`)
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json({ cod_motivo: '99' })
    ).assertStatus(422)

    const r = await client
      .post(`/api/v1/comprobantes/${e.comprobanteId}/nota-credito`)
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json({
        cod_motivo: '07',
        des_motivo: 'Producto dañado',
        reponer_stock: true,
        items: [{ venta_item_id: item.id, cantidad: 1 }],
      })
    r.assertStatus(201)
    assert.equal(r.body().sunat_estado, 'enviado')
    assert.equal(await stock(e.producto.id), 7)

    // Lo ya comprometido en esta NC no se puede volver a acreditar
    ;(
      await client
        .post(`/api/v1/comprobantes/${e.comprobanteId}/nota-credito`)
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json({ cod_motivo: '07', items: [{ venta_item_id: item.id, cantidad: 3 }] })
    ).assertStatus(422)

    await client
      .post(`/api/v1/comprobantes/${r.body().id}/reconsultar`)
      .loginAs(e.admin)
      .headers(h(e.empresa))
    assert.equal(await stock(e.producto.id), 8)
    await e.venta.refresh()
    assert.equal(e.venta.estado, 'completada')
    // Reconsultar otra vez no repone dos veces
    await client
      .post(`/api/v1/comprobantes/${r.body().id}/reconsultar`)
      .loginAs(e.admin)
      .headers(h(e.empresa))
    assert.equal(await stock(e.producto.id), 8)
  })

  test('NC sobre venta al crédito rebaja la cuenta por cobrar', async ({ client, assert }) => {
    const falsa = new SunatFalsa().cuando(
      'POST /notas-credito',
      exito(comprobanteApi({ id: 703, tipo_documento: '07', sunat: { estado: 'aceptado' } }), 201)
    )
    const e = await conVenta(client, falsa, { tipo: '01', credito: true, cantidad: 2 })
    await client
      .post(`/api/v1/comprobantes/${e.comprobanteId}/nota-credito`)
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json({
        cod_motivo: '07',
        reponer_stock: false,
        items: [{ venta_item_id: e.venta.items[0].id, cantidad: 1 }],
      })
    const cuota = await CuentaCobrar.query().where('venta_id', e.venta.id).firstOrFail()
    assert.equal(cuota.saldo, 23.6)
    assert.equal(cuota.estado, 'parcial')
    assert.equal(await stock(e.producto.id), 8) // sin reposición
    assert.equal(falsa.llamadas.find((l) => l.ruta === '/notas-credito')!.cuerpo.serie, 'FC01')
  })

  test('NC sobre comprobante emitido sin venta usa los ítems del comprobante', async ({
    client,
    assert,
  }) => {
    const falsa = new SunatFalsa()
      .cuando('POST /boletas', exito(comprobanteApi(), 201))
      .cuando(
        'POST /notas-credito',
        exito(comprobanteApi({ id: 704, tipo_documento: '07', sunat: { estado: 'aceptado' } }), 201)
      )
      .instalar()
    const admin = await crearUsuario()
    const empresa = await crearEmpresa(admin)
    const c = await client
      .post('/api/v1/comprobantes')
      .loginAs(admin)
      .headers(h(empresa))
      .json({
        tipo_documento: '03',
        moneda: 'PEN',
        forma_pago: 'Contado',
        cliente: { tipo_doc: '0', num_doc: '00000000', razon_social: 'CLIENTES VARIOS' },
        items: [
          {
            descripcion: 'Servicio',
            unidad: 'ZZ',
            cantidad: 2,
            precio_unitario: 5,
            tip_afe_igv: '10',
          },
        ],
      })
    ;(
      await client
        .post(`/api/v1/comprobantes/${c.body().id}/nota-credito`)
        .loginAs(admin)
        .headers(h(empresa))
        .json({ cod_motivo: '07', items: [{ indice: 5, cantidad: 1 }] })
    ).assertStatus(422)
    ;(
      await client
        .post(`/api/v1/comprobantes/${c.body().id}/nota-credito`)
        .loginAs(admin)
        .headers(h(empresa))
        .json({ cod_motivo: '07', items: [{ indice: 0, cantidad: 3 }] })
    ).assertStatus(422)
    const r = await client
      .post(`/api/v1/comprobantes/${c.body().id}/nota-credito`)
      .loginAs(admin)
      .headers(h(empresa))
      .json({ cod_motivo: '07', items: [{ indice: 0, cantidad: 1 }] })
    r.assertStatus(201)
    assert.equal(r.body().total, 5)
    assert.equal(falsa.llamadas.at(-1)!.cuerpo.items[0].cantidad, 1)
    const total = await client
      .post(`/api/v1/comprobantes/${c.body().id}/nota-credito`)
      .loginAs(admin)
      .headers(h(empresa))
      .json({ cod_motivo: '06' })
    total.assertStatus(422) // ya hay 5 acreditados y el total es 10: la devolución total (10) excede
  })

  test('no se emiten notas sobre comprobantes no aceptados ni guías', async ({ client }) => {
    const falsa = new SunatFalsa()
      .cuando('POST /boletas', exito(comprobanteApi({ sunat: { estado: 'rechazado' } }), 201))
      .instalar()
    void falsa
    const admin = await crearUsuario()
    const empresa = await crearEmpresa(admin)
    const c = await client
      .post('/api/v1/comprobantes')
      .loginAs(admin)
      .headers(h(empresa))
      .json({
        tipo_documento: '03',
        moneda: 'PEN',
        forma_pago: 'Contado',
        cliente: { tipo_doc: '0', num_doc: '00000000', razon_social: 'X' },
        items: [
          { descripcion: 'X', unidad: 'NIU', cantidad: 1, precio_unitario: 5, tip_afe_igv: '10' },
        ],
      })
    ;(
      await client
        .post(`/api/v1/comprobantes/${c.body().id}/nota-credito`)
        .loginAs(admin)
        .headers(h(empresa))
        .json({ cod_motivo: '01' })
    ).assertStatus(422)
    await Comprobante.query().where('id', c.body().id).update({ tipo_documento: '09' })
    ;(
      await client
        .post(`/api/v1/comprobantes/${c.body().id}/nota-debito`)
        .loginAs(admin)
        .headers(h(empresa))
        .json({
          cod_motivo: '01',
          items: [{ descripcion: 'Mora', cantidad: 1, precio_unitario: 5 }],
        })
    ).assertStatus(422)
  })

  test('sin serie de NC para el prefijo del documento responde 422', async ({ client }) => {
    const falsa = new SunatFalsa()
    const e = await conVenta(client, falsa)
    const { default: Serie } = await import('#models/serie')
    await Serie.query().where({ empresaId: e.empresa.id, serie: 'BC01' }).delete()
    ;(
      await client
        .post(`/api/v1/comprobantes/${e.comprobanteId}/nota-credito`)
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json({ cod_motivo: '01' })
    ).assertStatus(422)
  })

  test('nota de débito por intereses', async ({ client, assert }) => {
    const falsa = new SunatFalsa().cuando(
      'POST /notas-debito',
      exito(comprobanteApi({ id: 801, tipo_documento: '08', serie: 'FD01' }), 201)
    )
    const e = await conVenta(client, falsa, { tipo: '01' })
    ;(
      await client
        .post(`/api/v1/comprobantes/${e.comprobanteId}/nota-debito`)
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json({
          cod_motivo: '77',
          items: [{ descripcion: 'Mora', cantidad: 1, precio_unitario: 5 }],
        })
    ).assertStatus(422)
    const r = await client
      .post(`/api/v1/comprobantes/${e.comprobanteId}/nota-debito`)
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json({
        cod_motivo: '01',
        items: [{ descripcion: 'Intereses por mora', cantidad: 1, precio_unitario: 11.8 }],
      })
    r.assertStatus(201)
    const cuerpo = falsa.llamadas.find((l) => l.ruta === '/notas-debito')!.cuerpo
    assert.equal(cuerpo.serie, 'FD01')
    assert.equal(cuerpo.items[0].unidad, 'ZZ')
    assert.equal(r.body().total, 11.8)
    const motivos = await client
      .get('/api/v1/documentos/motivos')
      .loginAs(e.admin)
      .headers(h(e.empresa))
    assert.property(motivos.body().nota_credito, '06')
  })

  test('un Vendedor no puede emitir notas de crédito', async ({ client }) => {
    const falsa = new SunatFalsa()
    const e = await conVenta(client, falsa)
    const vendedor = await crearUsuario()
    await asignarRol(vendedor, e.empresa, 'Vendedor')
    ;(
      await client
        .post(`/api/v1/comprobantes/${e.comprobanteId}/nota-credito`)
        .loginAs(vendedor)
        .headers(h(e.empresa))
        .json({ cod_motivo: '01' })
    ).assertStatus(403)
  })
})

test.group('Guías de remisión', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.teardown(() => SunatGateway.usar(null))

  const guiaBase = {
    destinatario: { tipo_doc: '6', num_doc: '20512345678', razon_social: 'ACME SAC' },
    cod_traslado: '01',
    mod_traslado: '02',
    fecha_traslado: '2026-11-20',
    peso_total: 12.5,
    num_bultos: 2,
    partida: { ubigeo: '150101', direccion: 'Av. Origen 1' },
    llegada: { ubigeo: '150122', direccion: 'Av. Destino 2' },
    vehiculo: { placa: 'abc-123' },
    conductor: {
      tipo_doc: '1',
      num_doc: '45678912',
      licencia: 'Q45678912',
      nombres: 'Juan',
      apellidos: 'Pérez',
    },
  }

  test('bloquea la guía si la empresa no tiene credenciales GRE', async ({ client }) => {
    const falsa = new SunatFalsa()
    const e = await conVenta(client, falsa)
    const r = await client
      .post('/api/v1/guias')
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json({ ...guiaBase, venta_id: e.venta.id })
    r.assertStatus(422)
    r.assertBodyContains({ errores: [{ campo: 'gre' }] })
  })

  test('emite guía desde una venta (traslado privado) y valida el público', async ({
    client,
    assert,
  }) => {
    const falsa = new SunatFalsa().cuando(
      'POST /guias-remision',
      exito(
        comprobanteApi({
          id: 901,
          tipo_documento: '09',
          serie: 'T001',
          numero_completo: 'T001-1',
          sunat: { estado: 'pendiente' },
        }),
        201
      )
    )
    const e = await conVenta(client, falsa)
    e.empresa.greConfigurada = true
    await e.empresa.save()
    ;(
      await client
        .post('/api/v1/guias')
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json({ ...guiaBase, vehiculo: null, conductor: null, venta_id: e.venta.id })
    ).assertStatus(422)
    ;(
      await client
        .post('/api/v1/guias')
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json({ ...guiaBase, mod_traslado: '01', venta_id: e.venta.id })
    ).assertStatus(422)
    ;(
      await client
        .post('/api/v1/guias')
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json({
          ...guiaBase,
          mod_traslado: '01',
          fecha_entrega_transportista: '2026-11-20',
          transportista: { tipo_doc: '6', num_doc: e.empresa.ruc, razon_social: 'Yo mismo' },
          venta_id: e.venta.id,
        })
    ).assertStatus(422)
    ;(
      await client.post('/api/v1/guias').loginAs(e.admin).headers(h(e.empresa)).json(guiaBase)
    ).assertStatus(422) // sin ítems ni venta

    const r = await client
      .post('/api/v1/guias')
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json({ ...guiaBase, venta_id: e.venta.id })
    r.assertStatus(201)
    assert.equal(r.body().tipo_documento, '09')
    assert.equal(r.body().sunat_estado, 'pendiente')
    const cuerpo = falsa.llamadas.find((l) => l.ruta === '/guias-remision')!.cuerpo
    assert.equal(cuerpo.vehiculo.placa, 'ABC-123')
    assert.equal(cuerpo.items[0].cantidad, 3)
    assert.equal(cuerpo.partida_ubigeo, '150101')
    assert.isUndefined(cuerpo.transportista)
    assert.isNotNull(await Job.query().where('tipo', 'sunat.reconsultar').first())

    falsa.cuando(
      'POST /guias-remision',
      exito(
        comprobanteApi({
          id: 902,
          tipo_documento: '09',
          serie: 'T001',
          numero_completo: 'T001-2',
          sunat: { estado: 'pendiente' },
        }),
        201
      )
    )
    const publico = await client
      .post('/api/v1/guias')
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json({
        ...guiaBase,
        mod_traslado: '01',
        fecha_entrega_transportista: '2026-11-20',
        vehiculo: null,
        conductor: null,
        transportista: {
          tipo_doc: '6',
          num_doc: '20100000001',
          razon_social: 'Transportes SAC',
          nro_mtc: '123',
        },
        items: [{ descripcion: 'Cajas', cantidad: 2 }],
      })
    publico.assertStatus(201)
    const cuerpoPublico = falsa.llamadas.filter((l) => l.ruta === '/guias-remision').at(-1)!.cuerpo
    assert.equal(cuerpoPublico.transportista.num_doc, '20100000001')
    assert.equal(cuerpoPublico.items[0].unidad, 'NIU')
  })
})

test.group('Anulaciones: baja y resumen diario', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.teardown(() => SunatGateway.usar(null))

  test('boleta: se anula por resumen; al aceptarse se revierte la venta', async ({
    client,
    assert,
  }) => {
    const falsa = new SunatFalsa()
      .cuando(
        'POST /resumenes',
        exito({ id_resumen: 55, identifier: 'RC-20261117-001', estado_sunat: 'enviado' }, 201)
      )
      .cuando(
        'GET /resumenes/55/estado',
        exito({ estado_sunat: 'enviado' }),
        exito({ estado_sunat: 'aceptado', descripcion: 'Aceptado' })
      )
    const e = await conVenta(client, falsa)
    registrarJobsSunat()

    const r = await client
      .post('/api/v1/anulaciones')
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json({ comprobante_ids: [e.comprobanteId], motivo: 'Error en el monto' })
    r.assertStatus(201)
    assert.equal(r.body().tipo, 'resumen')
    assert.equal(r.body().identificador, 'RC-20261117-001')
    const cuerpo = falsa.llamadas.find((l) => l.ruta === '/resumenes')!.cuerpo
    assert.deepEqual(cuerpo.anular, [{ id: 501, motivo: 'Error en el monto' }])
    assert.equal(
      (await Comprobante.findOrFail(e.comprobanteId)).sunatEstado,
      'anulacion_en_proceso'
    )

    // 1ra consulta: sigue en proceso. 2da (vía worker): aceptado
    const consulta = await client
      .post(`/api/v1/anulaciones/${r.body().id}/consultar`)
      .loginAs(e.admin)
      .headers(h(e.empresa))
    assert.equal(consulta.body().estado, 'enviado')
    await Job.query()
      .where('tipo', 'sunat.anulacion')
      .update({ disponible_en: DateTime.now().minus({ seconds: 1 }).toSQL() })
    await procesarLote()

    assert.equal((await Comprobante.findOrFail(e.comprobanteId)).sunatEstado, 'anulado')
    await e.venta.refresh()
    assert.equal(e.venta.estado, 'anulada')
    assert.equal(await stock(e.producto.id), 10)

    const lista = await client
      .get('/api/v1/anulaciones?estado=aceptado')
      .loginAs(e.admin)
      .headers(h(e.empresa))
    assert.equal(lista.body().meta.total, 1)
    // Consultar una anulación ya resuelta no vuelve a llamar a la API
    const llamadas = falsa.llamadas.length
    await client
      .post(`/api/v1/anulaciones/${r.body().id}/consultar`)
      .loginAs(e.admin)
      .headers(h(e.empresa))
    assert.equal(falsa.llamadas.length, llamadas)
  })

  test('factura: comunicación de baja; si SUNAT la rechaza, el comprobante vuelve a aceptado', async ({
    client,
    assert,
  }) => {
    const falsa = new SunatFalsa()
      .cuando(
        'POST /anulaciones',
        exito({ id_anulacion: 66, identifier: 'RA-20261117-001', estado_sunat: 'enviado' }, 201)
      )
      .cuando(
        'GET /anulaciones/66/estado',
        exito({ estado_sunat: 'rechazado', descripcion: 'Documento con NC' })
      )
    const e = await conVenta(client, falsa, { tipo: '01' })
    const r = await client
      .post('/api/v1/anulaciones')
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json({ comprobante_ids: [e.comprobanteId], motivo: 'Error de cliente' })
    r.assertStatus(201)
    assert.equal(r.body().tipo, 'baja')
    const cuerpo = falsa.llamadas.find((l) => l.ruta === '/anulaciones')!.cuerpo
    assert.deepEqual(cuerpo.detalles, [
      { tipo_documento: '01', serie: 'F001', correlativo: 1, motivo: 'Error de cliente' },
    ])

    const consulta = await client
      .post(`/api/v1/anulaciones/${r.body().id}/consultar`)
      .loginAs(e.admin)
      .headers(h(e.empresa))
    assert.equal(consulta.body().estado, 'rechazado')
    assert.equal(consulta.body().sunat_descripcion, 'Documento con NC')
    assert.equal((await Comprobante.findOrFail(e.comprobanteId)).sunatEstado, 'aceptado')
    await e.venta.refresh()
    assert.equal(e.venta.estado, 'completada')
  })

  test('valida mezcla de tipos, estado, plazo y facturas con NC', async ({ client, assert }) => {
    const falsa = new SunatFalsa().cuando(
      'POST /notas-credito',
      exito(comprobanteApi({ id: 705, tipo_documento: '07', sunat: { estado: 'enviado' } }), 201)
    )
    const e = await conVenta(client, falsa, { tipo: '01' })
    ;(
      await client
        .post('/api/v1/anulaciones')
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json({ comprobante_ids: [999999], motivo: 'x' })
    ).assertStatus(422)

    // Boleta + factura en la misma solicitud
    const boleta = await Comprobante.create({
      uuid: crypto.randomUUID(),
      empresaId: e.empresa.id,
      tipoDocumento: '03',
      serie: 'B001',
      correlativo: 9,
      numeroCompleto: 'B001-9',
      fechaEmision: DateTime.now(),
      moneda: 'PEN',
      formaPago: 'Contado',
      clienteTipoDoc: '0',
      clienteNumDoc: '0',
      clienteRazonSocial: 'X',
      totalGravadas: 0,
      totalIgv: 0,
      total: 1,
      sunatEstado: 'aceptado',
      sunatApiId: 999,
      payload: {},
      reponeStock: false,
      stockAplicado: false,
    })
    const mezcla = await client
      .post('/api/v1/anulaciones')
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json({ comprobante_ids: [e.comprobanteId, boleta.id], motivo: 'Error' })
    mezcla.assertStatus(422)

    // Fuera de plazo
    await Comprobante.query()
      .where('id', boleta.id)
      .update({ fecha_emision: DateTime.now().minus({ days: 10 }).toISODate() })
    const tarde = await client
      .post('/api/v1/anulaciones')
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json({ comprobante_ids: [boleta.id], motivo: 'Error' })
    tarde.assertStatus(422)
    assert.include(JSON.stringify(tarde.body()), 'plazo')

    // No aceptada
    await Comprobante.query()
      .where('id', boleta.id)
      .update({ fecha_emision: DateTime.now().toISODate(), sunat_estado: 'rechazado' })
    ;(
      await client
        .post('/api/v1/anulaciones')
        .loginAs(e.admin)
        .headers(h(e.empresa))
        .json({ comprobante_ids: [boleta.id], motivo: 'Error' })
    ).assertStatus(422)

    // Factura con NC vigente
    await client
      .post(`/api/v1/comprobantes/${e.comprobanteId}/nota-credito`)
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json({ cod_motivo: '07', items: [{ venta_item_id: e.venta.items[0].id, cantidad: 1 }] })
    const conNota = await client
      .post('/api/v1/anulaciones')
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json({ comprobante_ids: [e.comprobanteId], motivo: 'Error' })
    conNota.assertStatus(422)
    assert.include(JSON.stringify(conNota.body()), 'nota de crédito')
  })

  test('el programador reencola anulaciones sin respuesta', async ({ client, assert }) => {
    const falsa = new SunatFalsa().cuando(
      'POST /resumenes',
      exito({ id_resumen: 77, estado_sunat: 'enviado' }, 201)
    )
    const e = await conVenta(client, falsa)
    const r = await client
      .post('/api/v1/anulaciones')
      .loginAs(e.admin)
      .headers(h(e.empresa))
      .json({ comprobante_ids: [e.comprobanteId], motivo: 'Error' })
    await Job.query().delete()
    const { default: Anulacion } = await import('#models/anulacion')
    await Anulacion.query()
      .where('id', r.body().id)
      .update({ updated_at: DateTime.now().minus({ hours: 1 }).toSQL() })
    assert.isAtLeast(await programarReconsultas(), 1)
    const job = await Job.query().where('tipo', 'sunat.anulacion').first()
    assert.isNotNull(job)
  })
})
