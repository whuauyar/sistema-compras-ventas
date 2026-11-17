import type { HttpContext } from '@adonisjs/core/http'
import '#types/http_context'
import {
  actualizarUsuarioEmpresaValidator,
  crearUsuarioEmpresaValidator,
} from '#validators/seguridad'
import { UsuariosEmpresaService } from '#services/usuarios_empresa_service'

const servicio = new UsuariosEmpresaService()
const actor = (ctx: HttpContext) => ({ usuarioId: ctx.auth.user!.id, ip: ctx.request.ip() })

/** Usuarios de la empresa activa y su rol en ella. */
export default class UsuariosController {
  async index({ empresa }: HttpContext) {
    return servicio.listar(empresa.id)
  }

  async store(ctx: HttpContext) {
    const datos = await ctx.request.validateUsing(crearUsuarioEmpresaValidator)
    const membresia = await servicio.agregar(ctx.empresa.id, datos, actor(ctx))
    return ctx.response.created({ membresia_id: membresia.id, usuario_id: membresia.usuarioId })
  }

  async update(ctx: HttpContext) {
    const datos = await ctx.request.validateUsing(actualizarUsuarioEmpresaValidator)
    await servicio.actualizar(ctx.empresa.id, Number(ctx.params.id), datos, actor(ctx))
    return { mensaje: 'Usuario actualizado.' }
  }
}
