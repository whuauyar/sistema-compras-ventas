import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import Comprobante from '#models/comprobante'
import type Empresa from '#models/empresa'
import Sucursal from '#models/sucursal'
import type { EstadoSunat, TipoDocumento } from '#constants/sunat'
import {
  SunatFalsa,
  boletaValida,
  comprobanteApi,
  crearEmpresa,
  crearUsuario,
  exito,
} from '#tests/helpers'
import { SunatGateway } from '#integrations/sunat/sunat_service'

const h = (e: Empresa) => ({ 'x-empresa-id': String(e.id) })

let secuencia = 0
async function comprobante(
  empresa: Empresa,
  datos: Partial<{
    tipo: TipoDocumento
    serie: string
    total: number
    estado: EstadoSunat
    cliente: string
    moneda: string
    fecha: string
    sucursalId: number | null
    enviado: DateTime | null
  }> = {}
) {
  secuencia++
  const serie = datos.serie ?? 'F001'
  return Comprobante.create({
    uuid: crypto.randomUUID(),
    empresaId: empresa.id,
    sucursalId: datos.sucursalId ?? null,
    tipoDocumento: datos.tipo ?? '01',
    serie,
    correlativo: secuencia,
    numeroCompleto: `${serie}-${String(secuencia).padStart(8, '0')}`,
    fechaEmision: datos.fecha ? DateTime.fromISO(datos.fecha) : DateTime.now(),
    moneda: datos.moneda ?? 'PEN',
    formaPago: 'Contado',
    clienteTipoDoc: '6',
    clienteNumDoc: '20100000001',
    clienteRazonSocial: datos.cliente ?? 'CLIENTE SAC',
    totalGravadas: 0,
    totalIgv: 0,
    total: datos.total ?? 100,
    sunatEstado: datos.estado ?? 'aceptado',
    sunatApiId: 500 + secuencia,
    sunatEnviadoEn: datos.enviado ?? null,
    payload: {},
    reponeStock: false,
    stockAplicado: false,
  })
}

test.group('Bandeja de comprobantes', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.teardown(() => SunatGateway.usar(null))

  test('indicadores por tipo, aceptados y monto neto con los mismos filtros', async ({
    client,
    assert,
  }) => {
    const admin = await crearUsuario()
    const empresa = await crearEmpresa(admin)
    await comprobante(empresa, { tipo: '01', total: 600 })
    await comprobante(empresa, { tipo: '01', total: 1132.8 })
    await comprobante(empresa, { tipo: '03', serie: 'B001', total: 140 })
    await comprobante(empresa, { tipo: '07', serie: 'FC01', total: 100 })
    await comprobante(empresa, { tipo: '08', serie: 'FD01', total: 10 })
    await comprobante(empresa, { tipo: '09', serie: 'T001', total: 0 })
    await comprobante(empresa, { tipo: '01', total: 999, estado: 'anulado' })
    await comprobante(empresa, { tipo: '03', serie: 'B001', total: 50, estado: 'rechazado' })

    const r = await client.get('/api/v1/comprobantes').loginAs(admin).headers(h(empresa))
    r.assertStatus(200)
    assert.deepEqual(r.body().resumen, {
      total: 8,
      facturas: 3,
      boletas: 2,
      notas_credito: 1,
      notas_debito: 1,
      guias: 1,
      aceptados: 6,
      rechazados: 1,
      monto_total: 600 + 1132.8 + 140 - 100 + 10,
    })
    assert.equal(r.body().meta.total, 8)

    const soloFacturas = await client
      .get('/api/v1/comprobantes?tipo_documento=01')
      .loginAs(admin)
      .headers(h(empresa))
    assert.equal(soloFacturas.body().resumen.total, 3)
    assert.equal(soloFacturas.body().resumen.boletas, 0)
  })

  test('filtra por sucursal, serie, moneda y fechas', async ({ client, assert }) => {
    const admin = await crearUsuario()
    const empresa = await crearEmpresa(admin)
    const sucursal = await Sucursal.findByOrFail('empresa_id', empresa.id)
    await comprobante(empresa, { sucursalId: sucursal.id, fecha: '2026-11-10' })
    await comprobante(empresa, { serie: 'F002', fecha: '2026-11-15' })
    await comprobante(empresa, { serie: 'B001', tipo: '03', moneda: 'USD', fecha: '2026-11-20' })
    const ver = async (qs: string) =>
      (await client.get(`/api/v1/comprobantes?${qs}`).loginAs(admin).headers(h(empresa))).body()

    assert.equal((await ver(`sucursal_id=${sucursal.id}`)).meta.total, 1)
    assert.equal((await ver('serie=f002')).meta.total, 1, 'la serie no distingue mayúsculas')
    assert.equal((await ver('moneda=USD')).meta.total, 1)
    assert.equal((await ver('fecha_desde=2026-11-12&fecha_hasta=2026-11-18')).meta.total, 1)
  })

  test('ordena por columna y respeta la dirección', async ({ client, assert }) => {
    const admin = await crearUsuario()
    const empresa = await crearEmpresa(admin)
    await comprobante(empresa, { total: 300, cliente: 'BETA SAC' })
    await comprobante(empresa, { total: 100, cliente: 'ALFA SAC' })
    await comprobante(empresa, { total: 200, cliente: 'GAMA SAC' })
    const totales = async (qs: string) =>
      (await client.get(`/api/v1/comprobantes?${qs}`).loginAs(admin).headers(h(empresa)))
        .body()
        .data.map((c: any) => Number(c.total))

    assert.deepEqual(await totales('ordenar=total'), [100, 200, 300])
    assert.deepEqual(await totales('ordenar=total&direccion=desc'), [300, 200, 100])
    const clientes = (
      await client.get('/api/v1/comprobantes?ordenar=cliente').loginAs(admin).headers(h(empresa))
    )
      .body()
      .data.map((c: any) => c.cliente_razon_social)
    assert.deepEqual(clientes, ['ALFA SAC', 'BETA SAC', 'GAMA SAC'])
  })

  test('rechaza un orden desconocido', async ({ client }) => {
    const admin = await crearUsuario()
    const empresa = await crearEmpresa(admin)
    const r = await client
      .get('/api/v1/comprobantes?ordenar=password')
      .loginAs(admin)
      .headers(h(empresa))
    r.assertStatus(422)
  })

  test('el listado no expone el payload ni la respuesta cruda', async ({ client, assert }) => {
    const admin = await crearUsuario()
    const empresa = await crearEmpresa(admin)
    await comprobante(empresa)
    const r = await client.get('/api/v1/comprobantes').loginAs(admin).headers(h(empresa))
    assert.notProperty(r.body().data[0], 'payload')
    assert.notProperty(r.body().data[0], 'ultima_respuesta')
  })

  test('al emitir se registra la fecha de envío y la respuesta se puede ver', async ({
    client,
    assert,
  }) => {
    new SunatFalsa().cuando('POST /boletas', exito(comprobanteApi({ id: 501 }), 201)).instalar()
    const admin = await crearUsuario()
    const empresa = await crearEmpresa(admin)
    const c = await client
      .post('/api/v1/comprobantes')
      .loginAs(admin)
      .headers(h(empresa))
      .json(boletaValida)
    c.assertStatus(201)
    const guardado = await Comprobante.findOrFail(c.body().id)
    assert.isNotNull(guardado.sunatEnviadoEn)

    const r = await client
      .get(`/api/v1/comprobantes/${guardado.id}/respuesta`)
      .loginAs(admin)
      .headers(h(empresa))
    r.assertStatus(200)
    assert.equal(r.body().respuesta_api.id, 501)
    assert.equal(r.body().numero_completo, guardado.numeroCompleto)
    assert.exists(r.body().sunat_enviado_en)
  })

  test('respuesta de un comprobante sin envío y de otra empresa', async ({ client, assert }) => {
    const admin = await crearUsuario()
    const empresa = await crearEmpresa(admin)
    const propio = await comprobante(empresa)
    const r = await client
      .get(`/api/v1/comprobantes/${propio.id}/respuesta`)
      .loginAs(admin)
      .headers(h(empresa))
    assert.isNull(r.body().respuesta_api)
    assert.isNull(r.body().sunat_enviado_en)

    const otra = await crearEmpresa(await crearUsuario())
    const ajeno = await comprobante(otra)
    const x = await client
      .get(`/api/v1/comprobantes/${ajeno.id}/respuesta`)
      .loginAs(admin)
      .headers(h(empresa))
    x.assertStatus(404)
  })
})
