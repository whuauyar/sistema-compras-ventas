import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Rol from '#models/rol'
import Sucursal from '#models/sucursal'
import Usuario from '#models/usuario'
import UsuarioEmpresaRol from '#models/usuario_empresa_rol'
import { asegurarOtroAdministrador } from '#services/permisos_service'
import { auditar } from '#services/auditoria_service'
import { ReglaNegocioError } from '#exceptions/regla_negocio_error'
import { ROL_ADMINISTRADOR } from '#constants/permisos'
import type { Actor } from '#services/empresa_service'

export interface DatosNuevoUsuario {
  nombre_completo: string
  email: string
  password?: string
  rol_id: number
  sucursal_ids?: number[]
}

export interface DatosActualizarUsuario {
  rol_id?: number
  activo?: boolean
  sucursal_ids?: number[]
}

/**
 * Usuarios de una empresa y su rol en ella. Lo usan el Administrador de la empresa
 * (sobre su empresa activa) y el SuperAdmin (sobre cualquier empresa).
 */
export class UsuariosEmpresaService {
  async listar(empresaId: number) {
    const membresias = await UsuarioEmpresaRol.query()
      .where('empresa_id', empresaId)
      .preload('usuario', (q) => q.preload('sucursales', (s) => s.where('empresa_id', empresaId)))
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
  async agregar(empresaId: number, datos: DatosNuevoUsuario, actor: Actor) {
    await this.validarRol(empresaId, datos.rol_id)
    await this.validarSucursales(empresaId, datos.sucursal_ids ?? [])

    return db.transaction(async (trx) => {
      let usuario = await Usuario.query({ client: trx }).where('email', datos.email).first()
      if (usuario?.esSuperadmin) {
        throw new ReglaNegocioError('El SuperAdmin no puede pertenecer a una empresa.', [
          { campo: 'email', mensaje: 'Use otro correo.' },
        ])
      }
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
            empresaPredeterminadaId: empresaId,
          },
          { client: trx }
        )
      }
      if (
        await UsuarioEmpresaRol.query({ client: trx })
          .where({ usuarioId: usuario.id, empresaId })
          .first()
      ) {
        throw new ReglaNegocioError('El usuario ya pertenece a esta empresa.', [
          { campo: 'email', mensaje: 'Ya es miembro.' },
        ])
      }
      const nueva = await UsuarioEmpresaRol.create(
        { usuarioId: usuario.id, empresaId, rolId: datos.rol_id, activo: true },
        { client: trx }
      )
      await this.sincronizarSucursales(usuario.id, empresaId, datos.sucursal_ids ?? [], trx)
      await auditar(
        {
          empresaId,
          usuarioId: actor.usuarioId,
          accion: 'usuario.agregar',
          entidad: 'usuario',
          entidadId: usuario.id,
          despues: { email: datos.email, rol_id: datos.rol_id },
          ip: actor.ip ?? null,
        },
        trx
      )
      return nueva
    })
  }

  async actualizar(
    empresaId: number,
    membresiaId: number,
    datos: DatosActualizarUsuario,
    actor: Actor
  ) {
    const membresia = await UsuarioEmpresaRol.query()
      .where({ id: membresiaId, empresaId })
      .preload('rol')
      .firstOrFail()

    const dejaDeSerAdmin =
      membresia.rol.nombre === ROL_ADMINISTRADOR &&
      ((datos.rol_id !== undefined && datos.rol_id !== membresia.rolId) || datos.activo === false)
    if (dejaDeSerAdmin) await asegurarOtroAdministrador(empresaId, membresia.id)
    if (datos.rol_id) await this.validarRol(empresaId, datos.rol_id)
    if (datos.sucursal_ids) await this.validarSucursales(empresaId, datos.sucursal_ids)

    const antes = { rol_id: membresia.rolId, activo: membresia.activo }
    await db.transaction(async (trx) => {
      membresia.useTransaction(trx)
      membresia.merge({
        rolId: datos.rol_id ?? membresia.rolId,
        activo: datos.activo ?? membresia.activo,
      })
      await membresia.save()
      if (datos.sucursal_ids)
        await this.sincronizarSucursales(membresia.usuarioId, empresaId, datos.sucursal_ids, trx)
      await auditar(
        {
          empresaId,
          usuarioId: actor.usuarioId,
          accion: 'usuario.actualizar',
          entidad: 'usuario',
          entidadId: membresia.usuarioId,
          antes,
          despues: datos,
          ip: actor.ip ?? null,
        },
        trx
      )
    })
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
    usuarioId: number,
    empresaId: number,
    ids: number[],
    trx: TransactionClientContract
  ) {
    const deEmpresa = trx.from('sucursales').where('empresa_id', empresaId).select('id')
    await trx
      .from('usuario_sucursal')
      .where('usuario_id', usuarioId)
      .whereIn('sucursal_id', deEmpresa)
      .delete()
    if (ids.length > 0) {
      await trx
        .table('usuario_sucursal')
        .multiInsert(ids.map((id) => ({ usuario_id: usuarioId, sucursal_id: id })))
    }
  }
}
