import type { HttpContext } from '@adonisjs/core/http'
import '#types/http_context'
import db from '@adonisjs/lucid/services/db'
import Permiso from '#models/permiso'
import Rol from '#models/rol'
import UsuarioEmpresaRol from '#models/usuario_empresa_rol'
import { rolValidator } from '#validators/seguridad'
import { asignarPermisos } from '#services/permisos_service'
import { auditarCtx } from '#services/auditoria_service'
import { ReglaNegocioError } from '#exceptions/regla_negocio_error'
import { CODIGOS_PERMISO, ROL_ADMINISTRADOR } from '#constants/permisos'

function vistaRol(rol: Rol, usuarios = 0) {
  return {
    id: rol.id,
    nombre: rol.nombre,
    descripcion: rol.descripcion,
    es_sistema: rol.esSistema,
    permisos: rol.permisos.map((p) => p.codigo),
    usuarios,
  }
}

/** Configurador de Rol: matriz módulos × acciones. */
export default class RolesController {
  /** Catálogo de permisos agrupado por módulo (para pintar la matriz). */
  async permisos() {
    const permisos = await Permiso.query().orderBy(['modulo', 'accion'])
    const agrupado: Record<
      string,
      Array<{ codigo: string; accion: string; descripcion: string }>
    > = {}
    for (const p of permisos) {
      ;(agrupado[p.modulo] ??= []).push({
        codigo: p.codigo,
        accion: p.accion,
        descripcion: p.descripcion,
      })
    }
    return agrupado
  }

  async index({ empresa }: HttpContext) {
    const roles = await Rol.query()
      .where('empresa_id', empresa.id)
      .preload('permisos')
      .orderBy('nombre')
    const conteos = await db
      .from('usuario_empresa_rol')
      .where('empresa_id', empresa.id)
      .groupBy('rol_id')
      .select('rol_id')
      .count('* as total')
    const porRol = new Map(conteos.map((c) => [c.rol_id, Number(c.total)]))
    return roles.map((r) => vistaRol(r, porRol.get(r.id) ?? 0))
  }

  async store(ctx: HttpContext) {
    const datos = await ctx.request.validateUsing(rolValidator)
    await this.asegurarNombreLibre(ctx.empresa.id, datos.nombre)
    const rol = await db.transaction(async (trx) => {
      const nuevo = await Rol.create(
        {
          empresaId: ctx.empresa.id,
          nombre: datos.nombre,
          descripcion: datos.descripcion ?? null,
          esSistema: false,
        },
        { client: trx }
      )
      await asignarPermisos(nuevo, datos.permisos, trx)
      await auditarCtx(ctx, 'rol.crear', 'rol', nuevo.id, { despues: datos }, trx)
      return nuevo
    })
    await rol.load('permisos')
    return ctx.response.created(vistaRol(rol))
  }

  async update(ctx: HttpContext) {
    const rol = await this.buscar(ctx)
    const datos = await ctx.request.validateUsing(rolValidator)
    if (rol.esSistema && datos.nombre !== rol.nombre) {
      throw new ReglaNegocioError('El rol Administrador no se puede renombrar.')
    }
    if (rol.esSistema && !CODIGOS_PERMISO.every((c) => datos.permisos.includes(c))) {
      throw new ReglaNegocioError('El rol Administrador debe conservar todos los permisos.')
    }
    if (datos.nombre !== rol.nombre) await this.asegurarNombreLibre(ctx.empresa.id, datos.nombre)

    await rol.load('permisos')
    const antes = vistaRol(rol)
    await db.transaction(async (trx) => {
      rol.useTransaction(trx)
      rol.merge({ nombre: datos.nombre, descripcion: datos.descripcion ?? null })
      await rol.save()
      await asignarPermisos(rol, datos.permisos, trx)
      await auditarCtx(ctx, 'rol.actualizar', 'rol', rol.id, { antes, despues: datos }, trx)
    })
    await rol.load('permisos')
    return vistaRol(rol)
  }

  async clonar(ctx: HttpContext) {
    const original = await this.buscar(ctx)
    await original.load('permisos')
    let nombre = `${original.nombre} (copia)`
    for (let i = 2; await Rol.query().where({ empresaId: ctx.empresa.id, nombre }).first(); i++) {
      nombre = `${original.nombre} (copia ${i})`
    }
    const copia = await db.transaction(async (trx) => {
      const nuevo = await Rol.create(
        { empresaId: ctx.empresa.id, nombre, descripcion: original.descripcion, esSistema: false },
        { client: trx }
      )
      await nuevo.related('permisos').attach(
        original.permisos.map((p) => p.id),
        trx
      )
      await auditarCtx(ctx, 'rol.clonar', 'rol', nuevo.id, { antes: { origen: original.id } }, trx)
      return nuevo
    })
    await copia.load('permisos')
    return ctx.response.created(vistaRol(copia))
  }

  async destroy(ctx: HttpContext) {
    const rol = await this.buscar(ctx)
    if (rol.esSistema || rol.nombre === ROL_ADMINISTRADOR) {
      throw new ReglaNegocioError('El rol Administrador no se puede eliminar.')
    }
    if (await UsuarioEmpresaRol.query().where('rol_id', rol.id).first()) {
      throw new ReglaNegocioError(
        'El rol tiene usuarios asignados. Reasígnelos antes de eliminarlo.'
      )
    }
    await rol.delete()
    await auditarCtx(ctx, 'rol.eliminar', 'rol', rol.id, { antes: { nombre: rol.nombre } })
    return ctx.response.noContent()
  }

  private buscar(ctx: HttpContext) {
    return Rol.query().where({ id: ctx.params.id, empresaId: ctx.empresa.id }).firstOrFail()
  }

  private async asegurarNombreLibre(empresaId: number, nombre: string) {
    if (await Rol.query().where({ empresaId }).whereILike('nombre', nombre).first()) {
      throw new ReglaNegocioError('Ya existe un rol con ese nombre.', [
        { campo: 'nombre', mensaje: 'Nombre en uso.' },
      ])
    }
  }
}
