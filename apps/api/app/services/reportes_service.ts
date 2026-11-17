import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { ReglaNegocioError } from '#exceptions/regla_negocio_error'
import Empresa from '#models/empresa'

export interface Columna {
  clave: string
  titulo: string
  tipo?: 'texto' | 'numero' | 'moneda' | 'fecha'
}

export interface Reporte {
  titulo: string
  columnas: Columna[]
  filas: Array<Record<string, unknown>>
}

export interface Rango {
  desde: string
  hasta: string
}

/** Rango por defecto: mes actual (hora de Lima). */
export function rangoPorDefecto(desde?: string, hasta?: string): Rango {
  const hoy = DateTime.now().setZone('America/Lima')
  return { desde: desde ?? hoy.startOf('month').toISODate()!, hasta: hasta ?? hoy.toISODate()! }
}

const n = (v: unknown) => Number(v ?? 0)
const r2 = (v: number) => Math.round(v * 100) / 100

/**
 * Base sin IGV de un ítem de venta, neto de devoluciones:
 * (cantidad - devuelta) × precio con IGV ÷ (1 + IGV si es gravado).
 */
const BASE_ITEM = `((vi.cantidad - vi.cantidad_devuelta) * vi.precio_unitario / (case when vi.tip_afe_igv like '1%' then 1 + e.igv_tasa else 1 end))`
const COSTO_ITEM = `((vi.cantidad - vi.cantidad_devuelta) * vi.costo_unitario)`

function ventasItems(empresaId: number, rango: Rango) {
  return db
    .from('ventas_items as vi')
    .join('ventas as v', 'v.id', 'vi.venta_id')
    .join('empresas as e', 'e.id', 'v.empresa_id')
    .where('v.empresa_id', empresaId)
    .where('v.estado', 'completada')
    .whereBetween('v.fecha', [rango.desde, rango.hasta])
}

export class ReportesService {
  async dashboard(empresa: Empresa, rango: Rango) {
    const ventas = await db
      .from('ventas')
      .where({ empresa_id: empresa.id, estado: 'completada' })
      .whereBetween('fecha', [rango.desde, rango.hasta])
      .count('* as cantidad')
      .sum('total as total')
      .first()

    const notas = await db
      .from('comprobantes')
      .where({ empresa_id: empresa.id, tipo_documento: '07', sunat_estado: 'aceptado' })
      .whereBetween('fecha_emision', [rango.desde, rango.hasta])
      .sum('total as total')
      .first()

    const margen = await ventasItems(empresa.id, rango)
      .select(db.raw(`sum(${BASE_ITEM}) as base`), db.raw(`sum(${COSTO_ITEM}) as costo`))
      .first()

    const compras = await db
      .from('compras')
      .where({ empresa_id: empresa.id, estado: 'registrada' })
      .whereBetween('fecha_emision', [rango.desde, rango.hasta])
      .select(db.raw('coalesce(sum(total * tipo_cambio), 0) as total'))
      .first()

    const saldo = async (tabla: string) => {
      const fila = await db
        .from(tabla)
        .where('empresa_id', empresa.id)
        .whereIn('estado', ['pendiente', 'parcial'])
        .select(
          db.raw('coalesce(sum(saldo), 0) as saldo'),
          db.raw(
            'coalesce(sum(case when fecha_vencimiento < current_date then saldo else 0 end), 0) as vencido'
          )
        )
        .first()
      return { saldo: n(fila?.saldo), vencido: n(fila?.vencido) }
    }

    const sunat = await db
      .from('comprobantes')
      .where('empresa_id', empresa.id)
      .select(
        db.raw("count(*) filter (where sunat_estado = 'rechazado') as rechazados"),
        db.raw("count(*) filter (where sunat_estado = 'error_envio') as sin_conexion"),
        db.raw(
          "count(*) filter (where sunat_estado in ('pendiente','enviado') and created_at < now() - interval '1 hour') as pendientes_1h"
        ),
        db.raw("count(*) filter (where sunat_estado = 'anulacion_en_proceso') as anulando")
      )
      .first()

    const porDia = await db
      .from('ventas')
      .where({ empresa_id: empresa.id, estado: 'completada' })
      .whereBetween('fecha', [rango.desde, rango.hasta])
      .select(db.raw("to_char(fecha, 'YYYY-MM-DD') as fecha"))
      .sum('total as total')
      .count('* as cantidad')
      .groupBy('fecha')
      .orderBy('fecha')

    const topProductos = await ventasItems(empresa.id, rango)
      .select('vi.producto_id', 'vi.descripcion')
      .select(
        db.raw('sum(vi.cantidad - vi.cantidad_devuelta) as cantidad'),
        db.raw(`sum(${BASE_ITEM}) as base`)
      )
      .groupBy('vi.producto_id', 'vi.descripcion')
      .orderBy('base', 'desc')
      .limit(5)

    const topClientes = await db
      .from('ventas')
      .where({ empresa_id: empresa.id, estado: 'completada' })
      .whereBetween('fecha', [rango.desde, rango.hasta])
      .select('cliente_num_doc', 'cliente_razon_social')
      .sum('total as total')
      .count('* as compras')
      .groupBy('cliente_num_doc', 'cliente_razon_social')
      .orderBy('total', 'desc')
      .limit(5)

    const bajoMinimo = await db
      .from('productos as p')
      .where({ 'p.empresa_id': empresa.id, 'p.activo': true, 'p.controla_stock': true })
      .whereRaw(
        'coalesce((select sum(s.cantidad) from stock s where s.producto_id = p.id), 0) <= p.stock_minimo'
      )
      .count('* as total')
      .first()

    const totalVentas = n(ventas?.total)
    const base = n(margen?.base)
    const costo = n(margen?.costo)
    return {
      rango,
      ventas: {
        total: r2(totalVentas),
        cantidad: n(ventas?.cantidad),
        ticket_promedio: n(ventas?.cantidad) > 0 ? r2(totalVentas / n(ventas?.cantidad)) : 0,
        notas_credito: r2(n(notas?.total)),
      },
      utilidad: {
        base: r2(base),
        costo: r2(costo),
        bruta: r2(base - costo),
        margen: base > 0 ? r2(((base - costo) / base) * 100) : 0,
      },
      compras: { total: r2(n(compras?.total)) },
      por_cobrar: await saldo('cuentas_cobrar'),
      por_pagar: await saldo('cuentas_pagar'),
      sunat: {
        rechazados: n(sunat?.rechazados),
        sin_conexion: n(sunat?.sin_conexion),
        pendientes_1h: n(sunat?.pendientes_1h),
        anulando: n(sunat?.anulando),
      },
      ventas_por_dia: porDia.map((d) => ({
        fecha: d.fecha,
        total: r2(n(d.total)),
        cantidad: n(d.cantidad),
      })),
      top_productos: topProductos.map((p) => ({
        producto_id: p.producto_id,
        descripcion: p.descripcion,
        cantidad: n(p.cantidad),
        base: r2(n(p.base)),
      })),
      top_clientes: topClientes.map((c) => ({
        num_doc: c.cliente_num_doc,
        razon_social: c.cliente_razon_social,
        total: r2(n(c.total)),
        compras: n(c.compras),
      })),
      productos_bajo_minimo: n(bajoMinimo?.total),
    }
  }

  async reporte(
    empresa: Empresa,
    tipo: string,
    rango: Rango,
    opciones: { agrupar?: string; productoId?: number; almacenId?: number }
  ): Promise<Reporte> {
    switch (tipo) {
      case 'ventas':
        return this.ventas(empresa, rango, opciones.agrupar ?? 'dia')
      case 'compras':
        return this.compras(empresa, rango, opciones.agrupar ?? 'dia')
      case 'utilidad':
        return this.utilidad(empresa, rango)
      case 'inventario':
        return this.inventario(empresa, opciones.almacenId)
      case 'kardex':
        return this.kardex(empresa, rango, opciones.productoId, opciones.almacenId)
      case 'registro-ventas':
        return this.registroVentas(empresa, rango)
      default:
        throw new ReglaNegocioError('Reporte desconocido.', [{ campo: 'tipo', mensaje: tipo }])
    }
  }

  private async ventas(empresa: Empresa, rango: Rango, agrupar: string): Promise<Reporte> {
    const base = () =>
      db
        .from('ventas as v')
        .where({ 'v.empresa_id': empresa.id, 'v.estado': 'completada' })
        .whereBetween('v.fecha', [rango.desde, rango.hasta])
    const agregados = (q: any) =>
      q
        .count('* as operaciones')
        .sum('v.total as total')
        .sum('v.total_igv as igv')
        .sum('v.costo_total as costo')

    let filas: any[]
    let primera: Columna[]
    switch (agrupar) {
      case 'producto': {
        filas = await ventasItems(empresa.id, rango)
          .select('vi.descripcion as producto')
          .select(
            db.raw('sum(vi.cantidad - vi.cantidad_devuelta) as cantidad'),
            db.raw('sum((vi.cantidad - vi.cantidad_devuelta) * vi.precio_unitario) as total')
          )
          .groupBy('vi.descripcion')
          .orderBy('total', 'desc')
        return {
          titulo: 'Ventas por producto',
          columnas: [
            { clave: 'producto', titulo: 'Producto' },
            { clave: 'cantidad', titulo: 'Cantidad', tipo: 'numero' },
            { clave: 'total', titulo: 'Total', tipo: 'moneda' },
          ],
          filas: filas.map((f) => ({
            producto: f.producto,
            cantidad: n(f.cantidad),
            total: r2(n(f.total)),
          })),
        }
      }
      case 'metodo_pago': {
        filas = await db
          .from('ventas_pagos as p')
          .join('ventas as v', 'v.id', 'p.venta_id')
          .where({ 'v.empresa_id': empresa.id, 'v.estado': 'completada' })
          .whereBetween('v.fecha', [rango.desde, rango.hasta])
          .select('p.metodo')
          .count('* as operaciones')
          .sum('p.monto as total')
          .groupBy('p.metodo')
          .orderBy('total', 'desc')
        return {
          titulo: 'Cobros por método de pago',
          columnas: [
            { clave: 'metodo', titulo: 'Método' },
            { clave: 'operaciones', titulo: 'Operaciones', tipo: 'numero' },
            { clave: 'total', titulo: 'Total', tipo: 'moneda' },
          ],
          filas: filas.map((f) => ({
            metodo: f.metodo,
            operaciones: n(f.operaciones),
            total: r2(n(f.total)),
          })),
        }
      }
      case 'cliente':
        filas = await agregados(
          base()
            .select('v.cliente_num_doc as documento', 'v.cliente_razon_social as cliente')
            .groupBy('v.cliente_num_doc', 'v.cliente_razon_social')
        ).orderBy('total', 'desc')
        primera = [
          { clave: 'documento', titulo: 'Documento' },
          { clave: 'cliente', titulo: 'Cliente' },
        ]
        break
      case 'vendedor':
        filas = await agregados(
          base()
            .leftJoin('usuarios as u', 'u.id', 'v.created_by')
            .select('u.nombre_completo as vendedor')
            .groupBy('u.nombre_completo')
        ).orderBy('total', 'desc')
        primera = [{ clave: 'vendedor', titulo: 'Vendedor' }]
        break
      case 'sucursal':
        filas = await agregados(
          base()
            .join('sucursales as s', 's.id', 'v.sucursal_id')
            .select('s.nombre as sucursal')
            .groupBy('s.nombre')
        ).orderBy('total', 'desc')
        primera = [{ clave: 'sucursal', titulo: 'Sucursal' }]
        break
      default:
        filas = await agregados(
          base().select(db.raw("to_char(v.fecha, 'YYYY-MM-DD') as fecha")).groupBy('v.fecha')
        ).orderBy('fecha')
        primera = [{ clave: 'fecha', titulo: 'Fecha', tipo: 'fecha' }]
    }
    return {
      titulo: `Ventas por ${agrupar === 'dia' || !['cliente', 'vendedor', 'sucursal'].includes(agrupar) ? 'día' : agrupar}`,
      columnas: [
        ...primera,
        { clave: 'operaciones', titulo: 'Operaciones', tipo: 'numero' },
        { clave: 'total', titulo: 'Total', tipo: 'moneda' },
        { clave: 'igv', titulo: 'IGV', tipo: 'moneda' },
        { clave: 'costo', titulo: 'Costo', tipo: 'moneda' },
      ],
      filas: filas.map((f) => ({
        ...f,
        operaciones: n(f.operaciones),
        total: r2(n(f.total)),
        igv: r2(n(f.igv)),
        costo: r2(n(f.costo)),
      })),
    }
  }

  private async compras(empresa: Empresa, rango: Rango, agrupar: string): Promise<Reporte> {
    if (agrupar === 'producto') {
      const filas = await db
        .from('compras_items as ci')
        .join('compras as c', 'c.id', 'ci.compra_id')
        .where({ 'c.empresa_id': empresa.id, 'c.estado': 'registrada' })
        .whereBetween('c.fecha_emision', [rango.desde, rango.hasta])
        .select('ci.descripcion as producto')
        .sum('ci.cantidad as cantidad')
        .select(db.raw('sum(ci.cantidad * ci.costo_unitario) as costo'))
        .groupBy('ci.descripcion')
        .orderBy('costo', 'desc')
      return {
        titulo: 'Compras por producto (costo sin IGV, PEN)',
        columnas: [
          { clave: 'producto', titulo: 'Producto' },
          { clave: 'cantidad', titulo: 'Cantidad', tipo: 'numero' },
          { clave: 'costo', titulo: 'Costo', tipo: 'moneda' },
        ],
        filas: filas.map((f) => ({
          producto: f.producto,
          cantidad: n(f.cantidad),
          costo: r2(n(f.costo)),
        })),
      }
    }
    const porProveedor = agrupar === 'proveedor'
    const q = db
      .from('compras as c')
      .join('proveedores as p', 'p.id', 'c.proveedor_id')
      .where({ 'c.empresa_id': empresa.id, 'c.estado': 'registrada' })
      .whereBetween('c.fecha_emision', [rango.desde, rango.hasta])
      .count('* as documentos')
      .select(
        db.raw('sum(c.total * c.tipo_cambio) as total'),
        db.raw('sum(c.total_igv * c.tipo_cambio) as igv')
      )
    const filas = porProveedor
      ? await q
          .select('p.num_doc as documento', 'p.razon_social as proveedor')
          .groupBy('p.num_doc', 'p.razon_social')
          .orderBy('total', 'desc')
      : await q
          .select(db.raw("to_char(c.fecha_emision, 'YYYY-MM-DD') as fecha"))
          .groupBy('c.fecha_emision')
          .orderBy('fecha')
    return {
      titulo: porProveedor ? 'Compras por proveedor (PEN)' : 'Compras por día (PEN)',
      columnas: [
        ...(porProveedor
          ? [
              { clave: 'documento', titulo: 'RUC' },
              { clave: 'proveedor', titulo: 'Proveedor' },
            ]
          : [{ clave: 'fecha', titulo: 'Fecha', tipo: 'fecha' as const }]),
        { clave: 'documentos', titulo: 'Documentos', tipo: 'numero' },
        { clave: 'total', titulo: 'Total', tipo: 'moneda' },
        { clave: 'igv', titulo: 'IGV', tipo: 'moneda' },
      ],
      filas: filas.map((f) => ({
        ...f,
        documentos: n(f.documentos),
        total: r2(n(f.total)),
        igv: r2(n(f.igv)),
      })),
    }
  }

  private async utilidad(empresa: Empresa, rango: Rango): Promise<Reporte> {
    const filas = await ventasItems(empresa.id, rango)
      .select('vi.descripcion as producto')
      .select(
        db.raw('sum(vi.cantidad - vi.cantidad_devuelta) as cantidad'),
        db.raw(`sum(${BASE_ITEM}) as venta`),
        db.raw(`sum(${COSTO_ITEM}) as costo`)
      )
      .groupBy('vi.descripcion')
      .orderByRaw(`sum(${BASE_ITEM}) - sum(${COSTO_ITEM}) desc`)
    return {
      titulo: 'Utilidad bruta por producto (sin IGV)',
      columnas: [
        { clave: 'producto', titulo: 'Producto' },
        { clave: 'cantidad', titulo: 'Cantidad', tipo: 'numero' },
        { clave: 'venta', titulo: 'Venta', tipo: 'moneda' },
        { clave: 'costo', titulo: 'Costo', tipo: 'moneda' },
        { clave: 'utilidad', titulo: 'Utilidad', tipo: 'moneda' },
        { clave: 'margen', titulo: 'Margen %', tipo: 'numero' },
      ],
      filas: filas.map((f) => {
        const venta = n(f.venta)
        const costo = n(f.costo)
        return {
          producto: f.producto,
          cantidad: n(f.cantidad),
          venta: r2(venta),
          costo: r2(costo),
          utilidad: r2(venta - costo),
          margen: venta > 0 ? r2(((venta - costo) / venta) * 100) : 0,
        }
      }),
    }
  }

  private async inventario(empresa: Empresa, almacenId?: number): Promise<Reporte> {
    const q = db
      .from('stock as s')
      .join('productos as p', 'p.id', 's.producto_id')
      .join('almacenes as a', 'a.id', 's.almacen_id')
      .where('s.empresa_id', empresa.id)
      .select(
        'p.codigo',
        'p.nombre as producto',
        'a.nombre as almacen',
        's.cantidad',
        's.costo_promedio',
        'p.stock_minimo'
      )
      .orderBy(['p.nombre', 'a.nombre'])
    if (almacenId) q.where('s.almacen_id', almacenId)
    const filas = await q
    return {
      titulo: 'Inventario valorizado (costo promedio)',
      columnas: [
        { clave: 'codigo', titulo: 'Código' },
        { clave: 'producto', titulo: 'Producto' },
        { clave: 'almacen', titulo: 'Almacén' },
        { clave: 'cantidad', titulo: 'Stock', tipo: 'numero' },
        { clave: 'costo_promedio', titulo: 'Costo prom.', tipo: 'moneda' },
        { clave: 'valor', titulo: 'Valor', tipo: 'moneda' },
        { clave: 'alerta', titulo: 'Alerta' },
      ],
      filas: filas.map((f) => ({
        codigo: f.codigo,
        producto: f.producto,
        almacen: f.almacen,
        cantidad: n(f.cantidad),
        costo_promedio: n(f.costo_promedio),
        valor: r2(n(f.cantidad) * n(f.costo_promedio)),
        alerta: n(f.cantidad) <= n(f.stock_minimo) ? 'Bajo mínimo' : '',
      })),
    }
  }

  private async kardex(
    empresa: Empresa,
    rango: Rango,
    productoId?: number,
    almacenId?: number
  ): Promise<Reporte> {
    if (!productoId)
      throw new ReglaNegocioError('Seleccione un producto.', [
        { campo: 'producto_id', mensaje: 'Requerido.' },
      ])
    const q = db
      .from('movimientos_kardex as k')
      .join('almacenes as a', 'a.id', 'k.almacen_id')
      .where({ 'k.empresa_id': empresa.id, 'k.producto_id': productoId })
      .whereRaw("(k.fecha at time zone 'America/Lima')::date between ? and ?", [
        rango.desde,
        rango.hasta,
      ])
      .select(
        db.raw("to_char(k.fecha at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI') as fecha"),
        'a.nombre as almacen',
        'k.tipo',
        'k.motivo',
        'k.referencia',
        'k.cantidad',
        'k.costo_unitario',
        'k.costo_total',
        'k.saldo_cantidad',
        'k.saldo_costo_promedio',
        'k.saldo_valor'
      )
      .orderBy('k.id')
    if (almacenId) q.where('k.almacen_id', almacenId)
    const filas = await q
    return {
      titulo: 'Kardex valorizado',
      columnas: [
        { clave: 'fecha', titulo: 'Fecha' },
        { clave: 'almacen', titulo: 'Almacén' },
        { clave: 'motivo', titulo: 'Motivo' },
        { clave: 'referencia', titulo: 'Documento' },
        { clave: 'entrada', titulo: 'Entrada', tipo: 'numero' },
        { clave: 'salida', titulo: 'Salida', tipo: 'numero' },
        { clave: 'costo_unitario', titulo: 'Costo unit.', tipo: 'moneda' },
        { clave: 'saldo_cantidad', titulo: 'Saldo', tipo: 'numero' },
        { clave: 'saldo_costo_promedio', titulo: 'Costo prom.', tipo: 'moneda' },
        { clave: 'saldo_valor', titulo: 'Valor saldo', tipo: 'moneda' },
      ],
      filas: filas.map((f) => ({
        fecha: f.fecha,
        almacen: f.almacen,
        motivo: f.motivo,
        referencia: f.referencia,
        entrada: f.tipo === 'entrada' ? n(f.cantidad) : null,
        salida: f.tipo === 'salida' ? n(f.cantidad) : null,
        costo_unitario: n(f.costo_unitario),
        saldo_cantidad: n(f.saldo_cantidad),
        saldo_costo_promedio: n(f.saldo_costo_promedio),
        saldo_valor: n(f.saldo_valor),
      })),
    }
  }

  /** Registro de ventas (comprobantes del periodo con su estado SUNAT). */
  private async registroVentas(empresa: Empresa, rango: Rango): Promise<Reporte> {
    const filas = await db
      .from('comprobantes')
      .where('empresa_id', empresa.id)
      .whereIn('tipo_documento', ['01', '03', '07', '08'])
      .whereBetween('fecha_emision', [rango.desde, rango.hasta])
      .select(
        db.raw("to_char(fecha_emision, 'YYYY-MM-DD') as fecha"),
        'tipo_documento',
        'numero_completo',
        'serie',
        'cliente_tipo_doc',
        'cliente_num_doc',
        'cliente_razon_social',
        'moneda',
        'total_gravadas',
        'total_igv',
        'total',
        'sunat_estado'
      )
      .orderBy(['fecha_emision', 'tipo_documento', 'serie', 'correlativo'])
    const signo = (tipo: string) => (tipo === '07' ? -1 : 1)
    return {
      titulo: 'Registro de ventas',
      columnas: [
        { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
        { clave: 'tipo_documento', titulo: 'Tipo' },
        { clave: 'numero', titulo: 'Número' },
        { clave: 'cliente_num_doc', titulo: 'Doc. cliente' },
        { clave: 'cliente_razon_social', titulo: 'Cliente' },
        { clave: 'moneda', titulo: 'Moneda' },
        { clave: 'base', titulo: 'Base imponible', tipo: 'moneda' },
        { clave: 'igv', titulo: 'IGV', tipo: 'moneda' },
        { clave: 'total', titulo: 'Total', tipo: 'moneda' },
        { clave: 'sunat_estado', titulo: 'Estado SUNAT' },
      ],
      filas: filas.map((f) => {
        const anulado = f.sunat_estado === 'anulado'
        const s = anulado ? 0 : signo(f.tipo_documento)
        return {
          fecha: f.fecha,
          tipo_documento: f.tipo_documento,
          numero: f.numero_completo ?? `${f.serie}-?`,
          cliente_num_doc: f.cliente_num_doc,
          cliente_razon_social: f.cliente_razon_social,
          moneda: f.moneda,
          base: r2(s * n(f.total_gravadas)),
          igv: r2(s * n(f.total_igv)),
          total: r2(s * n(f.total)),
          sunat_estado: f.sunat_estado,
        }
      }),
    }
  }
}

/** CSV compatible con Excel (BOM UTF-8, separador coma, comillas). */
export function aCsv(reporte: Reporte): string {
  const escapar = (v: unknown) => {
    if (v === null || v === undefined) return ''
    const texto = String(v)
    return /[",\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
  }
  const lineas = [reporte.columnas.map((c) => escapar(c.titulo)).join(',')]
  for (const fila of reporte.filas)
    lineas.push(reporte.columnas.map((c) => escapar(fila[c.clave])).join(','))
  return `\uFEFF${lineas.join('\r\n')}\r\n`
}
