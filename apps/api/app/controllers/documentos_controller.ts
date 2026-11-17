import { paginar } from '#services/paginacion'
import type { HttpContext } from '@adonisjs/core/http'
import '#types/http_context'
import Anulacion from '#models/anulacion'
import Comprobante from '#models/comprobante'
import { DocumentosService, MOTIVOS_NC, MOTIVOS_ND } from '#services/documentos_service'
import { AnulacionService } from '#services/anulacion_service'
import { auditarCtx } from '#services/auditoria_service'
import {
  anulacionValidator,
  guiaValidator,
  notaCreditoValidator,
  notaDebitoValidator,
} from '#validators/documentos'
import { listadoValidator } from '#validators/inventario'
import { qsPlano } from '#validators/qs'

const documentos = new DocumentosService()
const anulaciones = new AnulacionService()

/** Notas de crédito/débito, guías de remisión y anulaciones. */
export default class DocumentosController {
  async motivos() {
    return { nota_credito: MOTIVOS_NC, nota_debito: MOTIVOS_ND }
  }

  /** Documentos relacionados a un comprobante (sus NC/ND/guías). */
  async relacionados({ empresa, params }: HttpContext) {
    return Comprobante.query()
      .where({ empresaId: empresa.id, docReferenciaId: params.id })
      .orderBy('id')
  }

  async notaCredito(ctx: HttpContext) {
    const d = await ctx.request.validateUsing(notaCreditoValidator)
    const nota = await documentos.notaCredito(
      ctx.empresa,
      ctx.auth.user!.id,
      Number(ctx.params.id),
      {
        codMotivo: d.cod_motivo,
        desMotivo: d.des_motivo,
        reponerStock: d.reponer_stock,
        items: d.items?.map((i) => ({
          ventaItemId: i.venta_item_id,
          indice: i.indice,
          cantidad: i.cantidad,
        })),
      }
    )
    await auditarCtx(ctx, 'comprobante.nota_credito', 'comprobante', nota.id, {
      despues: { origen: ctx.params.id, motivo: d.cod_motivo, total: nota.total },
    })
    return ctx.response.status(nota.sunatEstado === 'error_envio' ? 202 : 201).send(nota)
  }

  async notaDebito(ctx: HttpContext) {
    const d = await ctx.request.validateUsing(notaDebitoValidator)
    const nota = await documentos.notaDebito(
      ctx.empresa,
      ctx.auth.user!.id,
      Number(ctx.params.id),
      { codMotivo: d.cod_motivo, desMotivo: d.des_motivo, items: d.items }
    )
    await auditarCtx(ctx, 'comprobante.nota_debito', 'comprobante', nota.id, {
      despues: { origen: ctx.params.id, motivo: d.cod_motivo, total: nota.total },
    })
    return ctx.response.status(nota.sunatEstado === 'error_envio' ? 202 : 201).send(nota)
  }

  async guia(ctx: HttpContext) {
    const d = await ctx.request.validateUsing(guiaValidator)
    const guia = await documentos.guiaRemision(ctx.empresa, ctx.auth.user!.id, {
      serie: d.serie,
      ventaId: d.venta_id,
      destinatario: d.destinatario,
      codTraslado: d.cod_traslado,
      modTraslado: d.mod_traslado,
      fechaTraslado: d.fecha_traslado,
      fechaEntregaTransportista: d.fecha_entrega_transportista,
      pesoTotal: d.peso_total,
      numBultos: d.num_bultos,
      partida: d.partida,
      llegada: d.llegada,
      transportista: d.transportista,
      vehiculo: d.vehiculo,
      conductor: d.conductor,
      items: d.items,
      observacion: d.observacion,
    })
    await auditarCtx(ctx, 'guia.emitir', 'comprobante', guia.id)
    return ctx.response.status(guia.sunatEstado === 'error_envio' ? 202 : 201).send(guia)
  }

  async anulaciones({ empresa, request }: HttpContext) {
    const f = await request.validateUsing(listadoValidator, { data: qsPlano(request.qs()) })
    const q = Anulacion.query().where('empresa_id', empresa.id)
    if (f.estado) q.whereIn('estado', f.estado.split(','))
    return paginar(q.orderBy('id', 'desc'), f.pagina ?? 1, f.por_pagina ?? 20)
  }

  async anular(ctx: HttpContext) {
    const d = await ctx.request.validateUsing(anulacionValidator)
    const anulacion = await anulaciones.anular(
      ctx.empresa,
      ctx.auth.user!.id,
      d.comprobante_ids,
      d.motivo
    )
    await auditarCtx(ctx, `anulacion.${anulacion.tipo}`, 'anulacion', anulacion.id, { despues: d })
    return ctx.response.created(anulacion)
  }

  async consultarAnulacion(ctx: HttpContext) {
    const anulacion = await Anulacion.query()
      .where({ id: ctx.params.id, empresaId: ctx.empresa.id })
      .firstOrFail()
    return anulaciones.consultar(ctx.empresa, anulacion)
  }
}
