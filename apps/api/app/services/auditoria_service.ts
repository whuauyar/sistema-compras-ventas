import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { HttpContext } from '@adonisjs/core/http'
import Auditoria from '#models/auditoria'

export interface EventoAuditoria {
  empresaId: number | null
  usuarioId: number | null
  accion: string
  entidad: string
  entidadId?: string | number | null
  antes?: unknown
  despues?: unknown
  ip?: string | null
}

/** Registra quién hizo qué, cuándo, y el antes/después del dato. */
export async function auditar(evento: EventoAuditoria, trx?: TransactionClientContract) {
  return Auditoria.create(
    {
      empresaId: evento.empresaId,
      usuarioId: evento.usuarioId,
      accion: evento.accion,
      entidad: evento.entidad,
      entidadId:
        evento.entidadId === null || evento.entidadId === undefined
          ? null
          : String(evento.entidadId),
      antes: evento.antes ?? null,
      despues: evento.despues ?? null,
      ip: evento.ip ?? null,
    },
    { client: trx }
  )
}

/** Atajo desde un controlador con empresa activa. */
export function auditarCtx(
  ctx: HttpContext,
  accion: string,
  entidad: string,
  entidadId: string | number | null,
  cambios: { antes?: unknown; despues?: unknown } = {},
  trx?: TransactionClientContract
) {
  return auditar(
    {
      empresaId: ctx.empresa?.id ?? null,
      usuarioId: ctx.auth.user?.id ?? null,
      accion,
      entidad,
      entidadId,
      ...cambios,
      ip: ctx.request.ip(),
    },
    trx
  )
}
