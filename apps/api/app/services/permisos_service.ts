import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { CODIGOS_PERMISO, PERMISOS, PLANTILLAS_ROL, ROL_ADMINISTRADOR } from '#constants/permisos'
import Permiso from '#models/permiso'
import Rol from '#models/rol'
import RolPlantilla from '#models/rol_plantilla'
import UsuarioEmpresaRol from '#models/usuario_empresa_rol'
import { ReglaNegocioError } from '#exceptions/regla_negocio_error'

/** Inserta/actualiza el catálogo de permisos (idempotente). */
export async function sincronizarCatalogoPermisos() {
  await Permiso.updateOrCreateMany(
    'codigo',
    PERMISOS.map((p) => ({ ...p }))
  )
}

/** Siembra los roles plantilla globales desde las constantes si aún no existen (idempotente). */
export async function asegurarPlantillas(trx?: TransactionClientContract) {
  const existentes = await RolPlantilla.query({ client: trx }).count('* as total').first()
  if (Number(existentes!.$extras.total) > 0) return
  const permisos = await Permiso.query({ client: trx })
  const idPorCodigo = new Map(permisos.map((p) => [p.codigo, p.id]))
  for (const [nombre, plantilla] of Object.entries(PLANTILLAS_ROL)) {
    const rol = await RolPlantilla.create(
      { nombre, descripcion: plantilla.descripcion, esSistema: nombre === ROL_ADMINISTRADOR },
      { client: trx }
    )
    const ids = plantilla.permisos
      .map((c) => idPorCodigo.get(c))
      .filter((id): id is number => id !== undefined)
    await rol.related('permisos').attach(ids, trx)
  }
}

/** Códigos de permiso que la empresa tiene habilitados por el SuperAdmin. */
export async function permisosHabilitados(
  empresaId: number,
  trx?: TransactionClientContract
): Promise<Set<string>> {
  const filas = await (trx ?? db)
    .from('empresa_permiso as ep')
    .join('permisos as p', 'p.id', 'ep.permiso_id')
    .where('ep.empresa_id', empresaId)
    .select('p.codigo')
  return new Set(filas.map((f) => f.codigo as string))
}

/** Valida que todos los códigos existan en el catálogo y devuelve sus permisos. */
async function permisosDelCatalogo(codigos: string[], trx?: TransactionClientContract) {
  const unicos = [...new Set(codigos)]
  const permisos = await Permiso.query({ client: trx }).whereIn('codigo', unicos)
  if (permisos.length !== unicos.length) {
    const validos = new Set(permisos.map((p) => p.codigo))
    throw new ReglaNegocioError(
      'Hay permisos que no existen.',
      unicos
        .filter((c) => !validos.has(c))
        .map((c) => ({ campo: 'permisos', mensaje: `Permiso desconocido: ${c}` }))
    )
  }
  return permisos
}

/**
 * Define el tope de permisos de una empresa. Los roles pierden lo que quede fuera del tope y
 * el rol Administrador (de sistema) recibe todo lo habilitado.
 */
export async function habilitarPermisos(
  empresaId: number,
  codigos: string[] = [...CODIGOS_PERMISO],
  trx: TransactionClientContract
) {
  const permisos = await permisosDelCatalogo(codigos, trx)
  const ids = permisos.map((p) => p.id)
  await trx.from('empresa_permiso').where('empresa_id', empresaId).delete()
  if (ids.length > 0) {
    await trx
      .table('empresa_permiso')
      .multiInsert(ids.map((id) => ({ empresa_id: empresaId, permiso_id: id })))
  }
  const rolesEmpresa = trx.from('roles').where('empresa_id', empresaId).select('id')
  const quitar = trx.from('rol_permiso').whereIn('rol_id', rolesEmpresa)
  if (ids.length > 0) quitar.whereNotIn('permiso_id', ids)
  await quitar.delete()

  const administrador = await Rol.query({ client: trx })
    .where({ empresaId, esSistema: true })
    .first()
  if (administrador) await administrador.related('permisos').sync(ids, true, trx)
}

/** Crea los roles plantilla en una empresa, recortados a sus permisos habilitados. Devuelve el Administrador. */
export async function crearRolesPlantilla(
  empresaId: number,
  trx: TransactionClientContract
): Promise<Rol> {
  await asegurarPlantillas(trx)
  const habilitados = await permisosHabilitados(empresaId, trx)
  const plantillas = await RolPlantilla.query({ client: trx }).preload('permisos').orderBy('id')
  const todos = await Permiso.query({ client: trx })
  let administrador: Rol | null = null

  for (const plantilla of plantillas) {
    const esAdmin = plantilla.esSistema
    const rol = await Rol.create(
      {
        empresaId,
        nombre: plantilla.nombre,
        descripcion: plantilla.descripcion,
        esSistema: esAdmin,
      },
      { client: trx }
    )
    const fuente = esAdmin ? todos : plantilla.permisos
    const ids = fuente.filter((p) => habilitados.has(p.codigo)).map((p) => p.id)
    await rol.related('permisos').attach(ids, trx)
    if (esAdmin) administrador = rol
  }
  if (!administrador) {
    throw new ReglaNegocioError('Falta la plantilla de rol Administrador.')
  }
  return administrador
}

/**
 * Reemplaza los permisos de un rol validando que existan en el catálogo y, si se indica,
 * que estén dentro del tope habilitado para la empresa.
 */
export async function asignarPermisos(
  rol: Rol | RolPlantilla,
  codigos: string[],
  trx: TransactionClientContract,
  habilitados?: Set<string>
) {
  const permisos = await permisosDelCatalogo(codigos, trx)
  if (habilitados) {
    const fuera = permisos.filter((p) => !habilitados.has(p.codigo))
    if (fuera.length > 0) {
      throw new ReglaNegocioError(
        'Hay permisos que su empresa no tiene habilitados.',
        fuera.map((p) => ({ campo: 'permisos', mensaje: `No habilitado: ${p.codigo}` }))
      )
    }
  }
  await (rol as Rol).related('permisos').sync(
    permisos.map((p) => p.id),
    true,
    trx
  )
}

/**
 * Impide dejar a la empresa sin ningún Administrador activo
 * (al cambiar el rol de un usuario o desactivarlo).
 */
export async function asegurarOtroAdministrador(empresaId: number, membresiaIdExcluida: number) {
  const fila = await db
    .from('usuario_empresa_rol as uer')
    .join('roles as r', 'r.id', 'uer.rol_id')
    .where('uer.empresa_id', empresaId)
    .where('uer.activo', true)
    .where('r.nombre', ROL_ADMINISTRADOR)
    .whereNot('uer.id', membresiaIdExcluida)
    .count('* as total')
    .first()
  if (Number(fila?.total ?? 0) === 0) {
    throw new ReglaNegocioError('La empresa debe conservar al menos un Administrador activo.')
  }
}

export async function membresiaDe(usuarioId: number, empresaId: number) {
  return UsuarioEmpresaRol.query().where({ usuarioId, empresaId }).first()
}
