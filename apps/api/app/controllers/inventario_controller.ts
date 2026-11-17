import { qsPlano } from '#validators/qs'
import { paginar } from '#services/paginacion'
import type { HttpContext } from '@adonisjs/core/http'
import '#types/http_context'
import db from '@adonisjs/lucid/services/db'
import MovimientoKardex from '#models/movimiento_kardex'
import Almacen from '#models/almacen'
import { ajusteValidator, listadoValidator, transferenciaValidator } from '#validators/inventario'
import { ajustar, transferir } from '#services/inventario_service'
import { auditarCtx } from '#services/auditoria_service'

export default class InventarioController {
  async almacenes({ empresa }: HttpContext) {
    return Almacen.query().where('empresa_id', empresa.id).orderBy('id')
  }

  /** Kardex de un producto (opcionalmente por almacén y rango de fechas). */
  async kardex({ empresa, request }: HttpContext) {
    const f = await request.validateUsing(listadoValidator, { data: qsPlano(request.qs()) })
    const q = MovimientoKardex.query().where('empresa_id', empresa.id)
    if (f.producto_id) q.where('producto_id', f.producto_id)
    if (f.almacen_id) q.where('almacen_id', f.almacen_id)
    if (f.desde) q.where('fecha', '>=', f.desde)
    if (f.hasta) q.where('fecha', '<', db.raw(`?::date + 1`, [f.hasta]))
    return await paginar(q.orderBy('id', 'desc'), f.pagina ?? 1, f.por_pagina ?? 100)
  }

  async ajuste(ctx: HttpContext) {
    const d = await ctx.request.validateUsing(ajusteValidator)
    const ajuste = await db.transaction((trx) =>
      ajustar(trx, ctx.empresa.id, ctx.auth.user!.id, {
        almacenId: d.almacen_id,
        tipo: d.tipo,
        motivo: d.motivo,
        observacion: d.observacion,
        items: d.items.map((i) => ({
          productoId: i.producto_id,
          cantidad: i.cantidad,
          costoUnitario: i.costo_unitario,
        })),
      })
    )
    await auditarCtx(ctx, 'inventario.ajuste', 'ajuste', ajuste.id, { despues: d })
    return ctx.response.created(ajuste)
  }

  async transferencia(ctx: HttpContext) {
    const d = await ctx.request.validateUsing(transferenciaValidator)
    const transferencia = await db.transaction((trx) =>
      transferir(trx, ctx.empresa.id, ctx.auth.user!.id, {
        almacenOrigenId: d.almacen_origen_id,
        almacenDestinoId: d.almacen_destino_id,
        observacion: d.observacion,
        items: d.items.map((i) => ({ productoId: i.producto_id, cantidad: i.cantidad })),
      })
    )
    await auditarCtx(ctx, 'inventario.transferencia', 'transferencia', transferencia.id, {
      despues: d,
    })
    return ctx.response.created(transferencia)
  }
}
