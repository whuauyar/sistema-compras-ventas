import { paginar } from '#services/paginacion'
import type { HttpContext } from '@adonisjs/core/http'
import '#types/http_context'
import AperturaCaja from '#models/apertura_caja'
import Caja from '#models/caja'
import MovimientoCaja from '#models/movimiento_caja'
import { CajaService, resumenApertura } from '#services/caja_service'
import { auditarCtx } from '#services/auditoria_service'
import { aperturaValidator, cierreValidator, movimientoCajaValidator } from '#validators/ventas'
import { listadoValidator } from '#validators/inventario'
import { qsPlano } from '#validators/qs'

const servicio = new CajaService()

export default class CajaController {
  /** Cajas de la empresa con su apertura vigente (si hay). */
  async index({ empresa }: HttpContext) {
    const cajas = await Caja.query().where({ empresaId: empresa.id, activo: true }).orderBy('id')
    const abiertas = await AperturaCaja.query().where({ empresaId: empresa.id, estado: 'abierta' })
    return cajas.map((c) => ({
      ...c.serialize(),
      apertura: abiertas.find((a) => a.cajaId === c.id)?.serialize() ?? null,
    }))
  }

  async abrir(ctx: HttpContext) {
    const d = await ctx.request.validateUsing(aperturaValidator)
    const apertura = await servicio.abrir(
      ctx.empresa.id,
      ctx.auth.user!.id,
      d.caja_id,
      d.monto_inicial
    )
    await auditarCtx(ctx, 'caja.abrir', 'apertura_caja', apertura.id, { despues: d })
    return ctx.response.created(apertura)
  }

  async show({ empresa, params }: HttpContext) {
    const apertura = await AperturaCaja.query()
      .where({ id: params.id, empresaId: empresa.id })
      .preload('caja')
      .firstOrFail()
    const movimientos = await MovimientoCaja.query()
      .where('apertura_caja_id', apertura.id)
      .orderBy('id', 'desc')
    return { ...apertura.serialize(), ...(await resumenApertura(apertura)), movimientos }
  }

  async movimiento(ctx: HttpContext) {
    const d = await ctx.request.validateUsing(movimientoCajaValidator)
    const mov = await servicio.movimiento(
      ctx.empresa.id,
      ctx.auth.user!.id,
      Number(ctx.params.id),
      d
    )
    await auditarCtx(ctx, `caja.${d.tipo}`, 'apertura_caja', ctx.params.id, { despues: d })
    return ctx.response.created(mov)
  }

  async cerrar(ctx: HttpContext) {
    const d = await ctx.request.validateUsing(cierreValidator)
    const apertura = await servicio.cerrar(
      ctx.empresa.id,
      Number(ctx.params.id),
      d.monto_declarado,
      d.observacion
    )
    await auditarCtx(ctx, 'caja.cerrar', 'apertura_caja', apertura.id, {
      despues: {
        esperado: apertura.montoEsperado,
        declarado: apertura.montoDeclarado,
        diferencia: apertura.diferencia,
      },
    })
    return apertura
  }

  async historial({ empresa, request }: HttpContext) {
    const f = await request.validateUsing(listadoValidator, { data: qsPlano(request.qs()) })
    return paginar(
      AperturaCaja.query().where('empresa_id', empresa.id).preload('caja').orderBy('id', 'desc'),
      f.pagina ?? 1,
      f.por_pagina ?? 20
    )
  }
}
