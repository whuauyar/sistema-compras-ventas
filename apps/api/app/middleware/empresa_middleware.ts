import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import '#types/http_context'
import UsuarioEmpresaRol from '#models/usuario_empresa_rol'
import { permisosHabilitados } from '#services/permisos_service'

/**
 * Resuelve la empresa activa desde la cabecera `X-Empresa-Id` y verifica que el usuario
 * autenticado sea miembro activo. Carga sus permisos en ctx.permisos.
 * Es la barrera principal del aislamiento multiempresa.
 */
export default class EmpresaMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const usuario = ctx.auth.getUserOrFail()
    const empresaId = Number(ctx.request.header('x-empresa-id'))

    if (!Number.isInteger(empresaId) || empresaId <= 0) {
      return ctx.response.badRequest({ mensaje: 'Seleccione una empresa (cabecera X-Empresa-Id).' })
    }

    const membresia = await UsuarioEmpresaRol.query()
      .where('usuario_id', usuario.id)
      .where('empresa_id', empresaId)
      .where('activo', true)
      .preload('empresa')
      .preload('rol', (q) => q.preload('permisos'))
      .first()

    if (!membresia) {
      return ctx.response.forbidden({ mensaje: 'No tiene acceso a esta empresa.' })
    }
    if (!membresia.empresa.activo) {
      return ctx.response.forbidden({
        mensaje: 'La empresa está suspendida. Contacte al administrador de la plataforma.',
      })
    }

    // Permisos efectivos = los del rol, recortados al tope que el SuperAdmin habilitó
    const habilitados = await permisosHabilitados(empresaId)
    ctx.empresa = membresia.empresa
    ctx.membresia = membresia
    ctx.permisos = new Set(
      membresia.rol.permisos.map((p) => p.codigo).filter((c) => habilitados.has(c))
    )
    return next()
  }
}
