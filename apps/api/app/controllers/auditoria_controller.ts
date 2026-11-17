import type { HttpContext } from '@adonisjs/core/http'
import '#types/http_context'
import Auditoria from '#models/auditoria'

export default class AuditoriaController {
  async index({ empresa, request }: HttpContext) {
    const pagina = Number(request.input('pagina', 1)) || 1
    const consulta = Auditoria.query().where('empresa_id', empresa.id).orderBy('id', 'desc')
    const entidad = request.input('entidad')
    if (entidad) consulta.where('entidad', entidad)
    const resultado = await consulta.paginate(pagina, 50)
    return resultado.toJSON()
  }
}
