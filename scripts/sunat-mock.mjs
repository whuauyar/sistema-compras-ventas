/**
 * Simulador mínimo de la API de facturación SUNAT para desarrollo local y demos.
 * NO reemplaza el entorno beta real: solo responde con la forma del contrato.
 *   node scripts/sunat-mock.mjs   → http://localhost:9999/api/v1
 * Toda boleta/factura nace "enviado" y pasa a "aceptado" al reconsultarla
 * (salvo clientes con razón social que contenga RECHAZO → "rechazado").
 */
import { createServer } from 'node:http'

const PUERTO = Number(process.env.PUERTO ?? 9999)
const docs = new Map()
const anulaciones = new Map()
const correlativos = {}
let siguienteId = 1000

const pdfMinimo = (texto) =>
  `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 226 300]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj 4 0 obj<</Length ${44 + texto.length}>>stream\nBT /F1 10 Tf 10 280 Td (${texto}) Tj ET\nendstream endobj 5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF`

const ok = (res, datos, status = 200) => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ estado: 'exito', mensaje: 'ok', datos }))
}

const leer = (req) =>
  new Promise((r) => {
    let b = ''
    req.on('data', (c) => (b += c))
    req.on('end', () => {
      try {
        r(JSON.parse(b || '{}'))
      } catch {
        r({})
      }
    })
  })

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const ruta = url.pathname.replace('/api/v1', '')
  const m = req.method
  if (!req.headers['x-api-key'] && ruta !== '/registro') {
    res.writeHead(401, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ estado: 'error', mensaje: 'Las cabeceras X-Api-Key y X-Api-Secret son requeridas.' }))
  }

  if (m === 'GET' && ruta === '/empresa')
    return ok(res, { id: 1, ruc: '20601234567', razon_social: 'EMPRESA DEMO SAC', nombre_comercial: 'Demo', direccion: 'Av. Demo 123, Lima', ubigeo: '150101', entorno: 'beta', tax_regime: 'general', client_id: 'demo-gre', tiene_client_secret: true })
  if (m === 'GET' && ruta === '/sucursales') return ok(res, [{ id: 1, nombre: 'Principal', cod_local: '0000', es_principal: true }])
  if (m === 'POST' && ruta === '/sucursales') return ok(res, { id: ++siguienteId }, 201)
  if (m === 'POST' && ruta === '/series') {
    const b = await leer(req)
    return ok(res, { creadas: [{ id: ++siguienteId, serie: b.serie }] }, 201)
  }
  if (m === 'GET' && ruta === '/buscar-documento')
    return ok(res, { razon_social: url.searchParams.get('tipo') === '6' ? 'CLIENTE EMPRESA SAC' : 'JUAN PEREZ', direccion: 'Jr. Cliente 456, Lima' })

  const TIPOS = { boletas: '03', facturas: '01', 'notas-credito': '07', 'notas-debito': '08', 'guias-remision': '09' }
  const emision = /^\/(boletas|facturas|notas-credito|notas-debito|guias-remision)$/.exec(ruta)
  if (m === 'POST' && emision) {
    const b = await leer(req)
    correlativos[b.serie] = (correlativos[b.serie] ?? 0) + 1
    const total = emision[1] === 'guias-remision' ? 0 : b.items.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0)
    const gravadas = +(total / 1.18).toFixed(2)
    const doc = {
      id: ++siguienteId,
      tipo_documento: TIPOS[emision[1]],
      serie: b.serie,
      correlativo: correlativos[b.serie],
      numero_completo: `${b.serie}-${correlativos[b.serie]}`,
      totales: { gravadas, igv: +(total - gravadas).toFixed(2), total: +total.toFixed(2) },
      sunat: { estado: 'enviado', codigo: null, descripcion: null, notas: [], hash_cpe: null },
      rechazar: /RECHAZO/i.test(b.cliente?.razon_social ?? ''),
    }
    docs.set(doc.id, doc)
    return ok(res, doc, 201)
  }

  // Anulaciones: baja (facturas/notas) y resumen (boletas). Se aceptan en la primera consulta.
  if (m === 'POST' && (ruta === '/anulaciones' || ruta === '/resumenes')) {
    const b = await leer(req)
    const id = ++siguienteId
    const objetivos = ruta === '/resumenes'
      ? (b.anular ?? []).map((a) => docs.get(Number(a.id))).filter(Boolean)
      : (b.detalles ?? []).map((d) => [...docs.values()].find((x) => x.serie === d.serie && x.correlativo === Number(d.correlativo))).filter(Boolean)
    for (const d of objetivos) d.sunat = { ...d.sunat, estado: 'anulacion_en_proceso' }
    anulaciones.set(id, objetivos)
    const clave = ruta === '/resumenes' ? 'id_resumen' : 'id_anulacion'
    return ok(res, { [clave]: id, identifier: `${ruta === '/resumenes' ? 'RC' : 'RA'}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${id}`, estado_sunat: 'enviado' }, 201)
  }
  const estadoAnul = /^\/(anulaciones|resumenes)\/(\d+)\/estado$/.exec(ruta)
  if (m === 'GET' && estadoAnul) {
    for (const d of anulaciones.get(Number(estadoAnul[2])) ?? []) d.sunat = { ...d.sunat, estado: 'anulado' }
    return ok(res, { estado_sunat: 'aceptado', descripcion: 'La Comunicación de baja ha sido aceptada' })
  }

  const uno = /^\/(boletas|facturas|notas-credito|notas-debito|guias-remision)\/(\d+)(\/(pdf|xml|cdr|reenviar))?$/.exec(ruta)
  if (uno) {
    const doc = docs.get(Number(uno[2]))
    if (!doc) {
      res.writeHead(404, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ estado: 'error', mensaje: 'No encontrado' }))
    }
    if (uno[4] === 'pdf') {
      res.writeHead(200, { 'content-type': 'application/pdf' })
      return res.end(pdfMinimo(`${doc.numero_completo} - formato ${url.searchParams.get('format')}`))
    }
    if (uno[4] === 'xml') {
      res.writeHead(200, { 'content-type': 'application/xml' })
      return res.end(`<Invoice><ID>${doc.numero_completo}</ID></Invoice>`)
    }
    if (uno[4] === 'cdr') {
      res.writeHead(200, { 'content-type': 'application/zip' })
      return res.end('PK')
    }
    if (uno[4] === 'reenviar') doc.rechazar = false
    if (doc.sunat.estado === 'anulado' || doc.sunat.estado === 'anulacion_en_proceso') return ok(res, doc)
    doc.sunat = doc.rechazar
      ? { estado: 'rechazado', codigo: '2800', descripcion: 'El dato ingresado en el tipo de documento de identidad del receptor no está permitido.', notas: [], hash_cpe: null }
      : { estado: 'aceptado', codigo: '0', descripcion: `El comprobante ${doc.numero_completo} ha sido aceptado`, notas: [], hash_cpe: 'hAsH123=' }
    return ok(res, doc)
  }

  res.writeHead(404, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ estado: 'error', mensaje: `Ruta no simulada: ${m} ${ruta}` }))
}).listen(PUERTO, () => console.log(`Simulador SUNAT en http://localhost:${PUERTO}/api/v1`))
