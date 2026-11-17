import { paginar } from '#services/paginacion'
import type { HttpContext } from '@adonisjs/core/http'
import '#types/http_context'
import db from '@adonisjs/lucid/services/db'
import Venta from '#models/venta'
import CuentaCobrar from '#models/cuenta_cobrar'
import { VentaService } from '#services/venta_service'
import { auditarCtx } from '#services/auditoria_service'
import { cobroValidator, ventaValidator } from '#validators/ventas'
import { listadoValidator } from '#validators/inventario'
import { qsPlano } from '#validators/qs'

const servicio = new VentaService()

export default class VentasController {
  async index({ empresa, request }: HttpContext) {
    const f = await request.validateUsing(listadoValidator, { data: qsPlano(request.qs()) })
    const q = Venta.query().where('empresa_id', empresa.id).preload('comprobante')
    if (f.estado) q.where('estado', f.estado)
    if (f.desde) q.where('fecha', '>=', f.desde)
    if (f.hasta) q.where('fecha', '<=', f.hasta)
    if (f.buscar) {
      const t = `%${f.buscar}%`
      q.where((w) =>
        w
          .whereILike('cliente_razon_social', t)
          .orWhere('cliente_num_doc', f.buscar!)
          .orWhereHas('comprobante', (c) => c.whereILike('numero_completo', t))
      )
    }
    return paginar(q.orderBy('id', 'desc'), f.pagina ?? 1, f.por_pagina ?? 20)
  }

  async show({ empresa, params }: HttpContext) {
    return Venta.query()
      .where({ id: params.id, empresaId: empresa.id })
      .preload('items')
      .preload('pagos')
      .preload('cuotas')
      .preload('comprobante')
      .firstOrFail()
  }

  async store(ctx: HttpContext) {
    const d = await ctx.request.validateUsing(ventaValidator)
    const { venta, comprobante } = await servicio.registrar(
      ctx.empresa,
      ctx.auth.user!.id,
      ctx.permisos,
      {
        tipoDocumento: d.tipo_documento,
        serie: d.serie,
        almacenId: d.almacen_id,
        cajaId: d.caja_id,
        clienteId: d.cliente_id,
        cliente: d.cliente,
        moneda: d.moneda,
        formaPago: d.forma_pago,
        cuotas: d.cuotas,
        items: d.items.map((i) => ({
          productoId: i.producto_id,
          cantidad: i.cantidad,
          precioUnitario: i.precio_unitario,
          descuento: i.descuento,
        })),
        pagos: d.pagos,
      }
    )
    await auditarCtx(ctx, 'venta.registrar', 'venta', venta.id, {
      despues: {
        total: venta.total,
        comprobante: comprobante.numeroCompleto,
        estado: comprobante.sunatEstado,
      },
    })
    return ctx.response.created({ venta, comprobante })
  }

  async cuentasPorCobrar({ empresa, request }: HttpContext) {
    const f = await request.validateUsing(listadoValidator, { data: qsPlano(request.qs()) })
    const q = CuentaCobrar.query()
      .where('empresa_id', empresa.id)
      .preload('venta', (v) => v.preload('comprobante'))
    q.whereIn('estado', (f.estado ?? 'pendiente,parcial').split(','))
    if (f.buscar)
      q.whereHas('venta', (v) =>
        v.whereILike('cliente_razon_social', `%${f.buscar}%`).orWhere('cliente_num_doc', f.buscar!)
      )
    const pagina = await paginar(q.orderBy('fecha_vencimiento'), f.pagina ?? 1, f.por_pagina ?? 50)
    const resumen = await db
      .from('cuentas_cobrar')
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

  async cobrar(ctx: HttpContext) {
    const d = await ctx.request.validateUsing(cobroValidator)
    const cuota = await servicio.cobrar(ctx.empresa, ctx.auth.user!.id, Number(ctx.params.id), {
      monto: d.monto,
      metodo: d.metodo,
      cajaId: d.caja_id,
      referencia: d.referencia,
    })
    await auditarCtx(ctx, 'cxc.cobrar', 'cuenta_cobrar', cuota.id, { despues: d })
    return cuota
  }
}
