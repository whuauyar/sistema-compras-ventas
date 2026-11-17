import type { HttpContext } from '@adonisjs/core/http'
import '#types/http_context'
import vine from '@vinejs/vine'
import { ReportesService, aCsv, rangoPorDefecto } from '#services/reportes_service'
import { qsPlano } from '#validators/qs'

const servicio = new ReportesService()
const fecha = () => vine.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const filtros = vine.compile(
  vine.object({
    desde: fecha().optional(),
    hasta: fecha().optional(),
    agrupar: vine
      .enum([
        'dia',
        'producto',
        'cliente',
        'vendedor',
        'sucursal',
        'metodo_pago',
        'proveedor',
      ] as const)
      .optional(),
    producto_id: vine.number().positive().optional(),
    almacen_id: vine.number().positive().optional(),
    formato: vine.enum(['json', 'csv'] as const).optional(),
  })
)

export default class ReportesController {
  async dashboard({ empresa, request }: HttpContext) {
    const f = await request.validateUsing(filtros, { data: qsPlano(request.qs()) })
    return servicio.dashboard(empresa, rangoPorDefecto(f.desde, f.hasta))
  }

  /** GET /reportes/:tipo?desde&hasta&agrupar&formato=csv */
  async show({ empresa, request, params, response }: HttpContext) {
    const f = await request.validateUsing(filtros, { data: qsPlano(request.qs()) })
    const rango = rangoPorDefecto(f.desde, f.hasta)
    const reporte = await servicio.reporte(empresa, params.tipo, rango, {
      agrupar: f.agrupar,
      productoId: f.producto_id,
      almacenId: f.almacen_id,
    })
    if (f.formato === 'csv') {
      response.header('content-type', 'text/csv; charset=utf-8')
      response.header(
        'content-disposition',
        `attachment; filename="${params.tipo}-${rango.desde}_${rango.hasta}.csv"`
      )
      return aCsv(reporte)
    }
    return { ...reporte, rango }
  }
}
