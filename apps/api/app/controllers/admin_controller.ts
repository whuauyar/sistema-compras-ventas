import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import Empresa from '#models/empresa'
import Permiso from '#models/permiso'
import Rol from '#models/rol'
import RolPlantilla from '#models/rol_plantilla'
import Sucursal from '#models/sucursal'
import { EmpresaService } from '#services/empresa_service'
import { UsuariosEmpresaService } from '#services/usuarios_empresa_service'
import {
  asegurarPlantillas,
  asignarPermisos,
  habilitarPermisos,
  permisosHabilitados,
} from '#services/permisos_service'
import { auditar } from '#services/auditoria_service'
import { ReglaNegocioError } from '#exceptions/regla_negocio_error'
import {
  estadoEmpresaValidator,
  permisosEmpresaValidator,
  registrarEmpresaValidator,
  vincularEmpresaValidator,
} from '#validators/empresa'
import {
  crearUsuarioEmpresaValidator,
  editarUsuarioAdminValidator,
  rolValidator,
} from '#validators/seguridad'

const empresas = new EmpresaService()
const usuarios = new UsuariosEmpresaService()
const actor = (ctx: HttpContext) => ({ usuarioId: ctx.auth.user!.id, ip: ctx.request.ip() })

function vistaEmpresa(empresa: Empresa) {
  return { ...empresa.serialize(), sunat_api_key: empresa.apiKeyEnmascarada() }
}

function vistaPlantilla(p: RolPlantilla) {
  return {
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion,
    es_sistema: p.esSistema,
    permisos: p.permisos.map((x) => x.codigo),
  }
}

/**
 * Consola del SuperAdmin de la plataforma: alta de empresas, tope de permisos por empresa,
 * activar/suspender, usuarios de cualquier empresa y roles plantilla globales.
 */
export default class AdminController {
  /** Catálogo completo de permisos agrupado por módulo. */
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

  // ---------------------------------------------------------------- Empresas

  async empresas() {
    const filas = await Empresa.query().orderBy('razon_social')
    const conteoUsuarios = await db
      .from('usuario_empresa_rol')
      .where('activo', true)
      .groupBy('empresa_id')
      .select('empresa_id')
      .count('* as total')
    const conteoPermisos = await db
      .from('empresa_permiso')
      .groupBy('empresa_id')
      .select('empresa_id')
      .count('* as total')
    const usuariosPor = new Map(conteoUsuarios.map((c) => [c.empresa_id, Number(c.total)]))
    const permisosPor = new Map(conteoPermisos.map((c) => [c.empresa_id, Number(c.total)]))
    return filas.map((e) => ({
      id: e.id,
      ruc: e.ruc,
      razon_social: e.razonSocial,
      nombre_comercial: e.nombreComercial,
      entorno: e.entorno,
      activo: e.activo,
      usuarios: usuariosPor.get(e.id) ?? 0,
      permisos_habilitados: permisosPor.get(e.id) ?? 0,
      created_at: e.createdAt,
    }))
  }

  async empresa({ params }: HttpContext) {
    const empresa = await Empresa.findOrFail(params.id)
    const roles = await Rol.query().where('empresa_id', empresa.id).orderBy('nombre')
    const sucursales = await Sucursal.query().where('empresa_id', empresa.id).orderBy('cod_local')
    return {
      sucursales: sucursales.map((x) => ({ id: x.id, nombre: x.nombre, cod_local: x.codLocal })),
      empresa: vistaEmpresa(empresa),
      permisos: [...(await permisosHabilitados(empresa.id))].sort(),
      roles: roles.map((r) => ({ id: r.id, nombre: r.nombre, es_sistema: r.esSistema })),
    }
  }

  /** Alta de empresa nueva en la API SUNAT con su Administrador. */
  async registrarEmpresa(ctx: HttpContext) {
    const datos = await ctx.request.validateUsing(registrarEmpresaValidator)
    const { empresa, advertencias } = await empresas.registrar(
      {
        ruc: datos.ruc,
        razonSocial: datos.razon_social,
        nombreComercial: datos.nombre_comercial,
        direccion: datos.direccion,
        ubigeo: datos.ubigeo,
        departamento: datos.departamento,
        provincia: datos.provincia,
        distrito: datos.distrito,
        solUser: datos.sol_user,
        solPass: datos.sol_pass,
        entorno: datos.entorno,
        regimen: datos.regimen,
        contrasenaCertificado: datos.contrasena_certificado,
        greClientId: datos.gre_client_id,
        greClientSecret: datos.gre_client_secret,
      },
      datos.certificado,
      { nombre: datos.admin_nombre, email: datos.admin_email, password: datos.admin_password },
      actor(ctx)
    )
    return ctx.response.created({ empresa: vistaEmpresa(empresa), advertencias })
  }

  /** Vincula una empresa ya registrada en la API SUNAT con su Administrador. */
  async vincularEmpresa(ctx: HttpContext) {
    const datos = await ctx.request.validateUsing(vincularEmpresaValidator)
    const { empresa, advertencias } = await empresas.vincular(
      { apiKey: datos.api_key, apiSecret: datos.api_secret },
      { nombre: datos.admin_nombre, email: datos.admin_email, password: datos.admin_password },
      actor(ctx)
    )
    return ctx.response.created({ empresa: vistaEmpresa(empresa), advertencias })
  }

  /** Activa o suspende la empresa: suspendida, ninguno de sus usuarios puede operar en ella. */
  async estadoEmpresa(ctx: HttpContext) {
    const empresa = await Empresa.findOrFail(ctx.params.id)
    const { activo } = await ctx.request.validateUsing(estadoEmpresaValidator)
    const antes = empresa.activo
    empresa.activo = activo
    await empresa.save()
    await auditar({
      empresaId: empresa.id,
      ...this.auditor(ctx),
      accion: activo ? 'empresa.activar' : 'empresa.suspender',
      entidad: 'empresa',
      entidadId: empresa.id,
      antes: { activo: antes },
      despues: { activo },
    })
    return { id: empresa.id, activo: empresa.activo }
  }

  /** Define el tope de permisos de la empresa; los roles se recortan a ese tope. */
  async permisosEmpresa(ctx: HttpContext) {
    const empresa = await Empresa.findOrFail(ctx.params.id)
    const { permisos } = await ctx.request.validateUsing(permisosEmpresaValidator)
    const antes = [...(await permisosHabilitados(empresa.id))].sort()
    await db.transaction(async (trx) => {
      await habilitarPermisos(empresa.id, permisos, trx)
      await auditar(
        {
          empresaId: empresa.id,
          ...this.auditor(ctx),
          accion: 'empresa.permisos',
          entidad: 'empresa',
          entidadId: empresa.id,
          antes,
          despues: [...permisos].sort(),
        },
        trx
      )
    })
    return { id: empresa.id, permisos: [...(await permisosHabilitados(empresa.id))].sort() }
  }

  // ---------------------------------------------------------------- Usuarios de una empresa

  async usuarios({ params }: HttpContext) {
    const empresa = await Empresa.findOrFail(params.id)
    return usuarios.listar(empresa.id)
  }

  async agregarUsuario(ctx: HttpContext) {
    const empresa = await Empresa.findOrFail(ctx.params.id)
    const datos = await ctx.request.validateUsing(crearUsuarioEmpresaValidator)
    const membresia = await usuarios.agregar(empresa.id, datos, actor(ctx))
    return ctx.response.created({ membresia_id: membresia.id, usuario_id: membresia.usuarioId })
  }

  async actualizarUsuario(ctx: HttpContext) {
    const empresa = await Empresa.findOrFail(ctx.params.id)
    const {
      nombre_completo: nombre,
      email,
      password,
      ...rol
    } = await ctx.request.validateUsing(editarUsuarioAdminValidator)
    const membresiaId = Number(ctx.params.membresiaId)
    if (Object.values(rol).some((v) => v !== undefined))
      await usuarios.actualizar(empresa.id, membresiaId, rol, actor(ctx))
    await usuarios.actualizarCuenta(
      empresa.id,
      membresiaId,
      { nombre_completo: nombre, email, password },
      actor(ctx)
    )
    return { mensaje: 'Usuario actualizado.' }
  }

  // ---------------------------------------------------------------- Roles plantilla globales

  async plantillas() {
    await asegurarPlantillas()
    const filas = await RolPlantilla.query().preload('permisos').orderBy('id')
    return filas.map(vistaPlantilla)
  }

  async crearPlantilla(ctx: HttpContext) {
    const datos = await ctx.request.validateUsing(rolValidator)
    await asegurarPlantillas()
    await this.asegurarNombrePlantillaLibre(datos.nombre)
    const plantilla = await db.transaction(async (trx) => {
      const nueva = await RolPlantilla.create(
        { nombre: datos.nombre, descripcion: datos.descripcion ?? null, esSistema: false },
        { client: trx }
      )
      await asignarPermisos(nueva, datos.permisos, trx)
      await auditar(
        {
          empresaId: null,
          ...this.auditor(ctx),
          accion: 'plantilla.crear',
          entidad: 'rol_plantilla',
          entidadId: nueva.id,
          despues: datos,
        },
        trx
      )
      return nueva
    })
    await plantilla.load('permisos')
    return ctx.response.created(vistaPlantilla(plantilla))
  }

  /** Solo afecta a las empresas que se creen después; los roles existentes no cambian. */
  async actualizarPlantilla(ctx: HttpContext) {
    const plantilla = await RolPlantilla.findOrFail(ctx.params.id)
    const datos = await ctx.request.validateUsing(rolValidator)
    if (plantilla.esSistema && datos.nombre !== plantilla.nombre) {
      throw new ReglaNegocioError('La plantilla Administrador no se puede renombrar.')
    }
    if (datos.nombre !== plantilla.nombre) await this.asegurarNombrePlantillaLibre(datos.nombre)
    await plantilla.load('permisos')
    const antes = vistaPlantilla(plantilla)
    await db.transaction(async (trx) => {
      plantilla.useTransaction(trx)
      plantilla.merge({ nombre: datos.nombre, descripcion: datos.descripcion ?? null })
      await plantilla.save()
      // El Administrador siempre recibe todo lo habilitado: sus permisos no se editan
      if (!plantilla.esSistema) await asignarPermisos(plantilla, datos.permisos, trx)
      await auditar(
        {
          empresaId: null,
          ...this.auditor(ctx),
          accion: 'plantilla.actualizar',
          entidad: 'rol_plantilla',
          entidadId: plantilla.id,
          antes,
          despues: datos,
        },
        trx
      )
    })
    await plantilla.load('permisos')
    return vistaPlantilla(plantilla)
  }

  async eliminarPlantilla(ctx: HttpContext) {
    const plantilla = await RolPlantilla.findOrFail(ctx.params.id)
    if (plantilla.esSistema) {
      throw new ReglaNegocioError('La plantilla Administrador no se puede eliminar.')
    }
    await plantilla.delete()
    await auditar({
      empresaId: null,
      ...this.auditor(ctx),
      accion: 'plantilla.eliminar',
      entidad: 'rol_plantilla',
      entidadId: plantilla.id,
      antes: { nombre: plantilla.nombre },
    })
    return ctx.response.noContent()
  }

  private auditor(ctx: HttpContext) {
    return { usuarioId: ctx.auth.user!.id, ip: ctx.request.ip() }
  }

  private async asegurarNombrePlantillaLibre(nombre: string) {
    if (await RolPlantilla.query().whereILike('nombre', nombre).first()) {
      throw new ReglaNegocioError('Ya existe una plantilla con ese nombre.', [
        { campo: 'nombre', mensaje: 'Nombre en uso.' },
      ])
    }
  }
}
