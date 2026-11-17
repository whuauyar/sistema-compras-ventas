import type { HttpContext } from '@adonisjs/core/http'
import hash from '@adonisjs/core/services/hash'
import { actualizarPerfilValidator, cambiarPasswordValidator } from '#validators/auth'
import { membresiaDe } from '#services/permisos_service'
import { auditar } from '#services/auditoria_service'

/** Configurador de Perfil: datos del propio usuario. */
export default class PerfilController {
  async show({ auth }: HttpContext) {
    return auth.getUserOrFail().serialize()
  }

  async update({ auth, request, response }: HttpContext) {
    const usuario = auth.getUserOrFail()
    const datos = await request.validateUsing(actualizarPerfilValidator)
    if (
      datos.empresa_predeterminada_id &&
      !(await membresiaDe(usuario.id, datos.empresa_predeterminada_id))
    ) {
      return response.unprocessableEntity({ mensaje: 'No pertenece a esa empresa.' })
    }
    usuario.merge({
      nombreCompleto: datos.nombre_completo ?? usuario.nombreCompleto,
      telefono: datos.telefono === undefined ? usuario.telefono : datos.telefono,
      formatoImpresion:
        datos.formato_impresion === undefined ? usuario.formatoImpresion : datos.formato_impresion,
      empresaPredeterminadaId:
        datos.empresa_predeterminada_id === undefined
          ? usuario.empresaPredeterminadaId
          : datos.empresa_predeterminada_id,
    })
    await usuario.save()
    return usuario.serialize()
  }

  async cambiarPassword({ auth, request, response }: HttpContext) {
    const usuario = auth.getUserOrFail()
    const datos = await request.validateUsing(cambiarPasswordValidator)
    if (!(await hash.verify(usuario.password, datos.password_actual))) {
      return response.unprocessableEntity({
        mensaje: 'La contraseña actual no es correcta.',
        errores: [{ campo: 'password_actual', mensaje: 'Incorrecta.' }],
      })
    }
    usuario.password = datos.password
    await usuario.save()
    await auditar({
      empresaId: null,
      usuarioId: usuario.id,
      accion: 'usuario.cambio_password',
      entidad: 'usuario',
      entidadId: usuario.id,
      ip: request.ip(),
    })
    return { mensaje: 'Contraseña actualizada.' }
  }
}
