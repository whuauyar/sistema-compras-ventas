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
    const filtrar = (consulta: any) => {
      consulta.where('empresa_id', empresa.id)
      if (f.estado) consulta.whereIn('sunat_estado', f.estado.split(','))
      if (f.tipo_documento) consulta.whereIn('tipo_documento', f.tipo_documento.split(','))
      if (f.fecha_desde) consulta.where('fecha_emision', '>=', f.fecha_desde)
      if (f.fecha_hasta) consulta.where('fecha_emision', '<=', f.fecha_hasta)
      if (f.sucursal_id) consulta.where('sucursal_id', f.sucursal_id)
      if (f.serie) consulta.where('serie', f.serie)
      if (f.moneda) consulta.where('moneda', f.moneda)
      if (f.buscar) {
        const texto = `%${f.buscar}%`
        consulta.where((q: any) =>
          q
            .whereILike('numero_completo', texto)
            .orWhereILike('cliente_razon_social', texto)
            .orWhere('cliente_num_doc', f.buscar!)
        )
      }
      return consulta
    }

    const columnas: Record<string, string> = {
      tipo: 'tipo_documento',
      numero: 'numero_completo',
      cliente: 'cliente_razon_social',
      total: 'total',
      estado: 'sunat_estado',
      emision: 'fecha_emision',
      envio: 'sunat_enviado_en',
    }
    const consulta = filtrar(Comprobante.query())
    if (f.ordenar) consulta.orderBy(columnas[f.ordenar], f.direccion ?? 'asc')
    consulta.orderBy('id', 'desc')
    const pagina = await consulta.paginate(f.pagina ?? 1, f.por_pagina ?? 20)

    // Indicadores con los mismos filtros (sin paginar)
    const fila = await filtrar(db.from('comprobantes'))
      .select(
        db.raw('count(*)::int as total'),
        db.raw(`count(*) filter (where tipo_documento = '01')::int as facturas`),
        db.raw(`count(*) filter (where tipo_documento = '03')::int as boletas`),
        db.raw(`count(*) filter (where tipo_documento = '07')::int as notas_credito`),
        db.raw(`count(*) filter (where tipo_documento = '08')::int as notas_debito`),
        db.raw(`count(*) filter (where tipo_documento in ('09', '31'))::int as guias`),
        db.raw(`count(*) filter (where sunat_estado = 'aceptado')::int as aceptados`),
        db.raw(`count(*) filter (where sunat_estado = 'rechazado')::int as rechazados`),
        // Neto: facturas, boletas y ND suman; NC resta; anulados y rechazados no cuentan
        db.raw(`coalesce(sum(case
          when sunat_estado in ('anulado', 'rechazado') or tipo_documento in ('09', '31') then 0
          when tipo_documento = '07' then -total
          else total end), 0)::float as monto_total`)
      )
      .first()

    return { ...pagina.toJSON(), resumen: fila }
  }

  /** Respuesta SUNAT del comprobante (para "Ver JSON"): estado, código, notas y respuesta cruda de la API. */
  async respuesta(ctx: HttpContext) {
    const c = await this.buscar(ctx)
    return {
      numero_completo: c.numeroCompleto,
      sunat_estado: c.sunatEstado,
      sunat_codigo: c.sunatCodigo,
      sunat_descripcion: c.sunatDescripcion,
      sunat_notas: c.sunatNotas,
      hash_cpe: c.hashCpe,
      sunat_enviado_en: c.sunatEnviadoEn,
      sunat_consultado_en: c.sunatConsultadoEn,
      respuesta_api: c.ultimaRespuesta ?? null,
    }
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
    // El frontend lo usa para marcar qué formato está mostrando la vista previa
    ctx.response.header('x-formato-impresion', efectivo)
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
