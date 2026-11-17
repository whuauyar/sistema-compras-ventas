import { qsPlano } from '#validators/qs'
import { paginar } from '#services/paginacion'
import type { HttpContext } from '@adonisjs/core/http'
import '#types/http_context'
import db from '@adonisjs/lucid/services/db'
import Compra from '#models/compra'
import CuentaPagar from '#models/cuenta_pagar'
import OrdenCompra from '#models/orden_compra'
import { CompraService } from '#services/compra_service'
import { auditarCtx } from '#services/auditoria_service'
import {
  compraValidator,
  listadoValidator,
  ordenCompraValidator,
  pagoValidator,
} from '#validators/inventario'

const servicio = new CompraService()

const items = (
  lista: Array<{
    producto_id: number
    descripcion?: string
    cantidad: number
    precio_unitario: number
    tip_afe_igv?: string
  }>
) =>
  lista.map((i) => ({
    productoId: i.producto_id,
    descripcion: i.descripcion,
    cantidad: i.cantidad,
    precioUnitario: i.precio_unitario,
    tipAfeIgv: i.tip_afe_igv,
  }))

export default class ComprasController {
  async index({ empresa, request }: HttpContext) {
    const f = await request.validateUsing(listadoValidator, { data: qsPlano(request.qs()) })
    const q = Compra.query().where('empresa_id', empresa.id).preload('proveedor')
    if (f.estado) q.where('estado', f.estado)
    if (f.desde) q.where('fecha_emision', '>=', f.desde)
    if (f.hasta) q.where('fecha_emision', '<=', f.hasta)
    if (f.buscar) {
      const t = `%${f.buscar}%`
      q.where((w) =>
        w
          .whereRaw("serie || '-' || numero ilike ?", [t])
          .orWhereHas('proveedor', (p) =>
            p.whereILike('razon_social', t).orWhere('num_doc', f.buscar!)
          )
      )
    }
    return await paginar(q.orderBy('id', 'desc'), f.pagina ?? 1, f.por_pagina ?? 20)
  }

  async show({ empresa, params }: HttpContext) {
    return Compra.query()
      .where({ id: params.id, empresaId: empresa.id })
      .preload('items')
      .preload('proveedor')
      .preload('cuotas')
      .firstOrFail()
  }

  async store(ctx: HttpContext) {
    const d = await ctx.request.validateUsing(compraValidator)
    const compra = await servicio.registrar(ctx.empresa, ctx.auth.user!.id, {
      proveedorId: d.proveedor_id,
      almacenId: d.almacen_id,
      ordenCompraId: d.orden_compra_id,
      tipoDocumento: d.tipo_documento,
      serie: d.serie,
      numero: d.numero,
      fechaEmision: d.fecha_emision,
      moneda: d.moneda,
      tipoCambio: d.tipo_cambio,
      formaPago: d.forma_pago,
      diasCredito: d.dias_credito,
      cuotas: d.cuotas?.map((c) => ({ monto: c.monto, fechaVencimiento: c.fecha_vencimiento })),
      observacion: d.observacion,
      items: items(d.items),
    })
    await auditarCtx(ctx, 'compra.registrar', 'compra', compra.id, {
      despues: { total: compra.total, documento: `${d.serie}-${d.numero}` },
    })
    return ctx.response.created(compra)
  }

  async anular(ctx: HttpContext) {
    const compra = await servicio.anular(ctx.empresa, ctx.auth.user!.id, Number(ctx.params.id))
    await auditarCtx(ctx, 'compra.anular', 'compra', compra.id)
    return compra
  }

  // ---------------------------------------------------- Órdenes de compra

  async ordenes({ empresa, request }: HttpContext) {
    const f = await request.validateUsing(listadoValidator, { data: qsPlano(request.qs()) })
    const q = OrdenCompra.query().where('empresa_id', empresa.id).preload('proveedor')
    if (f.estado) q.whereIn('estado', f.estado.split(','))
    return await paginar(q.orderBy('id', 'desc'), f.pagina ?? 1, f.por_pagina ?? 20)
  }

  async orden({ empresa, params }: HttpContext) {
    return OrdenCompra.query()
      .where({ id: params.id, empresaId: empresa.id })
      .preload('items')
      .preload('proveedor')
      .firstOrFail()
  }

  async crearOrden(ctx: HttpContext) {
    const d = await ctx.request.validateUsing(ordenCompraValidator)
    const orden = await servicio.crearOrden(ctx.empresa, ctx.auth.user!.id, {
      proveedorId: d.proveedor_id,
      almacenId: d.almacen_id,
      fecha: d.fecha,
      fechaEntrega: d.fecha_entrega,
      moneda: d.moneda,
      observacion: d.observacion,
      items: items(d.items),
    })
    await auditarCtx(ctx, 'orden_compra.crear', 'orden_compra', orden.id)
    return ctx.response.created(orden)
  }

  async aprobarOrden(ctx: HttpContext) {
    const orden = await servicio.cambiarEstadoOrden(
      ctx.empresa,
      ctx.auth.user!.id,
      Number(ctx.params.id),
      'aprobar'
    )
    await auditarCtx(ctx, 'orden_compra.aprobar', 'orden_compra', orden.id)
    return orden
  }

  async anularOrden(ctx: HttpContext) {
    const orden = await servicio.cambiarEstadoOrden(
      ctx.empresa,
      ctx.auth.user!.id,
      Number(ctx.params.id),
      'anular'
    )
    await auditarCtx(ctx, 'orden_compra.anular', 'orden_compra', orden.id)
    return orden
  }

  // ---------------------------------------------------- Cuentas por pagar

  async cuentasPorPagar({ empresa, request }: HttpContext) {
    const f = await request.validateUsing(listadoValidator, { data: qsPlano(request.qs()) })
    const q = CuentaPagar.query()
      .where('empresa_id', empresa.id)
      .preload('proveedor')
      .preload('compra')
    q.whereIn('estado', (f.estado ?? 'pendiente,parcial').split(','))
    const pagina = await paginar(q.orderBy('fecha_vencimiento'), f.pagina ?? 1, f.por_pagina ?? 50)
    const resumen = await db
      .from('cuentas_pagar')
      .where('empresa_id', empresa.id)
      .whereIn('estado', ['pendiente', 'parcial'])
      .select('moneda')
      .sum('saldo as saldo')
      .select(
        db.raw('sum(case when fecha_vencimiento < current_date then saldo else 0 end) as vencido')
      )
      .groupBy('moneda')
    return {
      ...pagina,
      resumen: resumen.map((r) => ({
        moneda: r.moneda,
        saldo: Number(r.saldo),
        vencido: Number(r.vencido),
      })),
    }
  }

  async pagar(ctx: HttpContext) {
    const d = await ctx.request.validateUsing(pagoValidator)
    const cuota = await servicio.pagar(ctx.empresa, ctx.auth.user!.id, Number(ctx.params.id), d)
    await auditarCtx(ctx, 'cxp.pagar', 'cuenta_pagar', cuota.id, { despues: d })
    return cuota
  }
}
