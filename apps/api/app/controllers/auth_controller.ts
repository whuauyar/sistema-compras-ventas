import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import Usuario from '#models/usuario'
import UsuarioEmpresaRol from '#models/usuario_empresa_rol'
import { loginValidator } from '#validators/auth'
import { auditar } from '#services/auditoria_service'
import { permisosHabilitados } from '#services/permisos_service'

/** Arma la sesión: perfil + empresas a las que pertenece con su rol y permisos. */
export async function sesionDe(usuario: Usuario) {
  const membresias = await UsuarioEmpresaRol.query()
    .where('usuario_id', usuario.id)
    .where('activo', true)
    .preload('empresa')
    .preload('rol', (q) => q.preload('permisos'))

  const activas = membresias.filter((m) => m.empresa.activo)
  const topes = new Map<number, Set<string>>()
  for (const m of activas) topes.set(m.empresaId, await permisosHabilitados(m.empresaId))

  return {
    usuario: usuario.serialize(),
    empresas: activas.map((m) => ({
      id: m.empresa.id,
      ruc: m.empresa.ruc,
      razon_social: m.empresa.razonSocial,
      nombre_comercial: m.empresa.nombreComercial,
      entorno: m.empresa.entorno,
      rol: { id: m.rol.id, nombre: m.rol.nombre },
      permisos: m.rol.permisos.map((p) => p.codigo).filter((c) => topes.get(m.empresaId)!.has(c)),
    })),
  }
}

export default class AuthController {
  async login({ request, response }: HttpContext) {
    const { email, password } = await request.validateUsing(loginValidator)
    const usuario = await Usuario.verifyCredentials(email, password)
    if (!usuario.activo) return response.forbidden({ mensaje: 'Usuario desactivado.' })
    usuario.ultimoAccesoEn = DateTime.now()
    await usuario.save()
    const token = await Usuario.accessTokens.create(usuario)
    await auditar({
      empresaId: null,
      usuarioId: usuario.id,
      accion: 'usuario.login',
      entidad: 'usuario',
      entidadId: usuario.id,
      ip: request.ip(),
    })
    return { token: token.value!.release(), ...(await sesionDe(usuario)) }
  }

  async logout({ auth }: HttpContext) {
    const usuario = auth.getUserOrFail()
    await Usuario.accessTokens.delete(usuario, usuario.currentAccessToken.identifier)
    return { mensaje: 'Sesión cerrada.' }
  }

  async yo({ auth }: HttpContext) {
    return sesionDe(auth.getUserOrFail())
  }
}
