import type { HttpContext } from '@adonisjs/core/http'
import '#types/http_context'
import db from '@adonisjs/lucid/services/db'
import Rol from '#models/rol'
import Sucursal from '#models/sucursal'
import Usuario from '#models/usuario'
import UsuarioEmpresaRol from '#models/usuario_empresa_rol'
import {
  actualizarUsuarioEmpresaValidator,
  crearUsuarioEmpresaValidator,
} from '#validators/seguridad'
import { asegurarOtroAdministrador } from '#services/permisos_service'
import { auditarCtx } from '#services/auditoria_service'
import { ReglaNegocioError } from '#exceptions/regla_negocio_error'
import { ROL_ADMINISTRADOR } from '#constants/permisos'

/** Usuarios de la empresa activa y su rol en ella. */
export default class UsuariosController {
  async index({ empresa }: HttpContext) {
    const membresias = await UsuarioEmpresaRol.query()
      .where('empresa_id', empresa.id)
      .preload('usuario', (q) => q.preload('sucursales', (s) => s.where('empresa_id', empresa.id)))
      .preload('rol')
      .orderBy('id')
    return membresias.map((m) => ({
      membresia_id: m.id,
      usuario_id: m.usuarioId,
      nombre_completo: m.usuario.nombreCompleto,
      email: m.usuario.email,
      rol: { id: m.rol.id, nombre: m.rol.nombre },
      activo: m.activo,
      sucursal_ids: m.usuario.sucursales.map((s) => s.id),
      ultimo_acceso_en: m.usuario.ultimoAccesoEn,
    }))
  }

  /** Agrega un usuario a la empresa (lo crea si su correo no existe). */
  async store(ctx: HttpContext) {
    const datos = await ctx.request.validateUsing(crearUsuarioEmpresaValidator)
    await this.validarRol(ctx.empresa.id, datos.rol_id)
    await this.validarSucursales(ctx.empresa.id, datos.sucursal_ids ?? [])

    const membresia = await db.transaction(async (trx) => {
      let usuario = await Usuario.query({ client: trx }).where('email', datos.email).first()
      if (!usuario) {
        if (!datos.password) {
          throw new ReglaNegocioError('Indique una contraseña inicial para el nuevo usuario.', [
            { campo: 'password', mensaje: 'Requerida para usuarios nuevos.' },
          ])
        }
        usuario = await Usuario.create(
          {
            nombreCompleto: datos.nombre_completo,
            email: datos.email,
            password: datos.password,
            activo: true,
            empresaPredeterminadaId: ctx.empresa.id,
          },
          { client: trx }
        )
      }
      if (
        await UsuarioEmpresaRol.query({ client: trx })
          .where({ usuarioId: usuario.id, empresaId: ctx.empresa.id })
          .first()
      ) {
        throw new ReglaNegocioError('El usuario ya pertenece a esta empresa.', [
          { campo: 'email', mensaje: 'Ya es miembro.' },
        ])
      }
      const nueva = await UsuarioEmpresaRol.create(
        { usuarioId: usuario.id, empresaId: ctx.empresa.id, rolId: datos.rol_id, activo: true },
        { client: trx }
      )
      await this.sincronizarSucursales(usuario, ctx.empresa.id, datos.sucursal_ids ?? [], trx)
      await auditarCtx(
        ctx,
        'usuario.agregar',
        'usuario',
        usuario.id,
        { despues: { email: datos.email, rol_id: datos.rol_id } },
        trx
      )
      return nueva
    })
    return ctx.response.created({ membresia_id: membresia.id, usuario_id: membresia.usuarioId })
  }

  async update(ctx: HttpContext) {
    const membresia = await UsuarioEmpresaRol.query()
      .where({ id: ctx.params.id, empresaId: ctx.empresa.id })
      .preload('rol')
      .preload('usuario')
      .firstOrFail()
    const datos = await ctx.request.validateUsing(actualizarUsuarioEmpresaValidator)

    const dejaDeSerAdmin =
      membresia.rol.nombre === ROL_ADMINISTRADOR &&
      ((datos.rol_id !== undefined && datos.rol_id !== membresia.rolId) || datos.activo === false)
    if (dejaDeSerAdmin) await asegurarOtroAdministrador(ctx.empresa.id, membresia.id)
    if (datos.rol_id) await this.validarRol(ctx.empresa.id, datos.rol_id)
    if (datos.sucursal_ids) await this.validarSucursales(ctx.empresa.id, datos.sucursal_ids)

    const antes = { rol_id: membresia.rolId, activo: membresia.activo }
    await db.transaction(async (trx) => {
      membresia.useTransaction(trx)
      membresia.merge({
        rolId: datos.rol_id ?? membresia.rolId,
        activo: datos.activo ?? membresia.activo,
      })
      await membresia.save()
      if (datos.sucursal_ids)
        await this.sincronizarSucursales(membresia.usuario, ctx.empresa.id, datos.sucursal_ids, trx)
      await auditarCtx(
        ctx,
        'usuario.actualizar',
        'usuario',
        membresia.usuarioId,
        { antes, despues: datos },
        trx
      )
    })
    return { mensaje: 'Usuario actualizado.' }
  }

  private async validarRol(empresaId: number, rolId: number) {
    if (!(await Rol.query().where({ id: rolId, empresaId }).first())) {
      throw new ReglaNegocioError('Rol no válido para esta empresa.', [
        { campo: 'rol_id', mensaje: 'Rol inexistente.' },
      ])
    }
  }

  private async validarSucursales(empresaId: number, ids: number[]) {
    if (ids.length === 0) return
    const total = await Sucursal.query()
      .where('empresa_id', empresaId)
      .whereIn('id', ids)
      .count('* as t')
      .first()
    if (Number(total!.$extras.t) !== new Set(ids).size) {
      throw new ReglaNegocioError('Hay sucursales que no pertenecen a la empresa.', [
        { campo: 'sucursal_ids', mensaje: 'Sucursal inválida.' },
      ])
    }
  }

  /** Reemplaza solo las sucursales de ESTA empresa (las de otras empresas no se tocan). */
  private async sincronizarSucursales(
    usuario: Usuario,
    empresaId: number,
    ids: number[],
    trx: any
  ) {
    const deEmpresa = db.from('sucursales').where('empresa_id', empresaId).select('id')
    await trx
      .from('usuario_sucursal')
      .where('usuario_id', usuario.id)
      .whereIn('sucursal_id', deEmpresa)
      .delete()
    if (ids.length > 0) {
      await trx
        .table('usuario_sucursal')
        .multiInsert(ids.map((id) => ({ usuario_id: usuario.id, sucursal_id: id })))
    }
  }
}
