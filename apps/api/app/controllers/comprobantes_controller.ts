import { qsPlano } from '#validators/qs'
import type { HttpContext } from '@adonisjs/core/http'
import '#types/http_context'
import { Readable } from 'node:stream'
import db from '@adonisjs/lucid/services/db'
import Caja from '#models/caja'
import Comprobante from '#models/comprobante'
import Sucursal from '#models/sucursal'
import { ComprobanteService } from '#services/comprobante_service'
import { SunatGateway } from '#integrations/sunat/sunat_service'
import { SunatApiError } from '#integrations/sunat/sunat_errors'
import { auditarCtx } from '#services/auditoria_service'
import { resolverFormatoImpresion } from '#domain/reglas_comprobante'
import type { FormatoImpresion } from '#constants/sunat'
import {
  emitirComprobanteValidator,
  formatoImpresionValidator,
  listarComprobantesValidator,
} from '#validators/comprobante'

const servicio = new ComprobanteService()

export default class ComprobantesController {
  async index({ empresa, request }: HttpContext) {
    const f = await request.validateUsing(listarComprobantesValidator, {
      data: qsPlano(request.qs()),
    })
    const consulta = Comprobante.query().where('empresa_id', empresa.id)
    if (f.estado) consulta.whereIn('sunat_estado', f.estado.split(','))
    if (f.tipo_documento) consulta.whereIn('tipo_documento', f.tipo_documento.split(','))
    if (f.fecha_desde) consulta.where('fecha_emision', '>=', f.fecha_desde)
    if (f.fecha_hasta) consulta.where('fecha_emision', '<=', f.fecha_hasta)
    if (f.buscar) {
      const texto = `%${f.buscar}%`
      consulta.where((q) =>
        q
          .whereILike('numero_completo', texto)
          .orWhereILike('cliente_razon_social', texto)
          .orWhere('cliente_num_doc', f.buscar!)
      )
    }
    const pagina = await consulta.orderBy('id', 'desc').paginate(f.pagina ?? 1, f.por_pagina ?? 20)
    return pagina.toJSON()
  }

  /** Contadores por estado SUNAT para los chips de la bandeja. */
  async resumenEstados({ empresa }: HttpContext) {
    const filas = await db
      .from('comprobantes')
      .where('empresa_id', empresa.id)
      .groupBy('sunat_estado')
      .select('sunat_estado')
      .count('* as total')
    const resumen: Record<string, number> = {}
    for (const f of filas) resumen[f.sunat_estado] = Number(f.total)
    return resumen
  }

  async store(ctx: HttpContext) {
    const d = await ctx.request.validateUsing(emitirComprobanteValidator)
    const comprobante = await servicio.emitirVenta(ctx.empresa, ctx.auth.user!.id, {
      tipoDocumento: d.tipo_documento,
      serie: d.serie,
      sucursalId: d.sucursal_id,
      fechaEmision: d.fecha_emision?.toISOString().slice(0, 10),
      moneda: d.moneda,
      formaPago: d.forma_pago,
      cuotas: d.cuotas,
      cliente: d.cliente,
      items: d.items,
    })
    await auditarCtx(ctx, 'comprobante.emitir', 'comprobante', comprobante.id, {
      despues: {
        numero: comprobante.numeroCompleto,
        estado: comprobante.sunatEstado,
        total: comprobante.total,
      },
    })
    // 202 si quedó pendiente de envío por caída de la API; 201 en el resto
    return ctx.response
      .status(comprobante.sunatEstado === 'error_envio' ? 202 : 201)
      .send(comprobante)
  }

  async show(ctx: HttpContext) {
    const comprobante = await this.buscar(ctx)
    return { ...comprobante.serialize(), payload: comprobante.payload }
  }

  async reconsultar(ctx: HttpContext) {
    return servicio.reconsultar(ctx.empresa, await this.buscar(ctx))
  }

  async reenviar(ctx: HttpContext) {
    const comprobante = await servicio.reenviar(ctx.empresa, await this.buscar(ctx))
    await auditarCtx(ctx, 'comprobante.reenviar', 'comprobante', comprobante.id)
    return comprobante
  }

  /** PDF en el formato pedido o el predeterminado (usuario > caja > sucursal > empresa). */
  async pdf(ctx: HttpContext) {
    const comprobante = await this.buscar(ctx)
    const { formato } = await ctx.request.validateUsing(formatoImpresionValidator, {
      data: ctx.request.qs(),
    })
    const cajaId = Number(ctx.request.header('x-caja-id')) || null
    const [sucursal, caja] = await Promise.all([
      comprobante.sucursalId ? Sucursal.find(comprobante.sucursalId) : null,
      cajaId ? Caja.query().where({ id: cajaId, empresaId: ctx.empresa.id }).first() : null,
    ])
    const efectivo =
      formato ??
      resolverFormatoImpresion({
        usuario: ctx.auth.user!.formatoImpresion,
        caja: caja?.formatoImpresion,
        sucursal: sucursal?.formatoImpresion,
        empresa: ctx.empresa.formatoImpresion,
      })
    return this.descargar(ctx, comprobante, 'pdf', efectivo)
  }

  async xml(ctx: HttpContext) {
    return this.descargar(ctx, await this.buscar(ctx), 'xml')
  }

  async cdr(ctx: HttpContext) {
    return this.descargar(ctx, await this.buscar(ctx), 'cdr')
  }

  /** Proxy de descarga: el navegador nunca ve las credenciales SUNAT. */
  private async descargar(
    ctx: HttpContext,
    comprobante: Comprobante,
    recurso: 'pdf' | 'xml' | 'cdr',
    formato?: FormatoImpresion
  ) {
    if (!comprobante.sunatApiId) {
      return ctx.response.conflict({ mensaje: 'El comprobante aún no fue registrado en SUNAT.' })
    }
    let respuesta: Response
    try {
      respuesta = await SunatGateway.cliente().descargar(
        ctx.empresa.credenciales(),
        comprobante.tipoDocumento,
        comprobante.sunatApiId,
        recurso,
        formato
      )
    } catch (error) {
      // La API responde 404 cuando SUNAT todavía no devolvió el archivo (típico del CDR)
      if (error instanceof SunatApiError && error.status === 404) {
        return ctx.response.notFound({
          mensaje:
            recurso === 'cdr'
              ? 'SUNAT aún no emitió el CDR de este comprobante. Consulte su estado e intente luego.'
              : 'El archivo aún no está disponible en el servicio de facturación.',
        })
      }
      throw error
    }
    const extension = recurso === 'pdf' ? 'pdf' : recurso === 'xml' ? 'xml' : 'zip'
    const nombre = `${ctx.empresa.ruc}-${comprobante.tipoDocumento}-${comprobante.numeroCompleto ?? comprobante.id}${formato ? `-${formato}` : ''}.${extension}`
    ctx.response.header(
      'content-type',
      respuesta.headers.get('content-type') ?? 'application/octet-stream'
    )
    ctx.response.header(
      'content-disposition',
      `${recurso === 'pdf' ? 'inline' : 'attachment'}; filename="${nombre}"`
    )
    return ctx.response.stream(Readable.fromWeb(respuesta.body as any))
  }

  private buscar(ctx: HttpContext) {
    return Comprobante.query().where({ id: ctx.params.id, empresaId: ctx.empresa.id }).firstOrFail()
  }
}
