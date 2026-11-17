import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { PERMISOS, PLANTILLAS_ROL, ROL_ADMINISTRADOR } from '#constants/permisos'
import Permiso from '#models/permiso'
import Rol from '#models/rol'
import UsuarioEmpresaRol from '#models/usuario_empresa_rol'
import { ReglaNegocioError } from '#exceptions/regla_negocio_error'

/** Inserta/actualiza el catálogo de permisos (idempotente). */
export async function sincronizarCatalogoPermisos() {
  await Permiso.updateOrCreateMany(
    'codigo',
    PERMISOS.map((p) => ({ ...p }))
  )
}

/** Crea los roles plantilla de una empresa. Devuelve el rol Administrador. */
export async function crearRolesPlantilla(
  empresaId: number,
  trx: TransactionClientContract
): Promise<Rol> {
  const permisos = await Permiso.query({ client: trx })
  const idPorCodigo = new Map(permisos.map((p) => [p.codigo, p.id]))
  let administrador: Rol | null = null

  for (const [nombre, plantilla] of Object.entries(PLANTILLAS_ROL)) {
    const rol = await Rol.create(
      {
        empresaId,
        nombre,
        descripcion: plantilla.descripcion,
        esSistema: nombre === ROL_ADMINISTRADOR,
      },
      { client: trx }
    )
    const ids = plantilla.permisos
      .map((c) => idPorCodigo.get(c))
      .filter((id): id is number => id !== undefined)
    await rol.related('permisos').attach(ids, trx)
    if (nombre === ROL_ADMINISTRADOR) administrador = rol
  }
  return administrador!
}

/** Reemplaza los permisos de un rol validando que existan en el catálogo. */
export async function asignarPermisos(rol: Rol, codigos: string[], trx: TransactionClientContract) {
  const permisos = await Permiso.query({ client: trx }).whereIn('codigo', codigos)
  if (permisos.length !== new Set(codigos).size) {
    const validos = new Set(permisos.map((p) => p.codigo))
    throw new ReglaNegocioError(
      'Hay permisos que no existen.',
      codigos
        .filter((c) => !validos.has(c))
        .map((c) => ({ campo: 'permisos', mensaje: `Permiso desconocido: ${c}` }))
    )
  }
  await rol.related('permisos').sync(
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
