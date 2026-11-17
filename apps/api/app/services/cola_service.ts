import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import Job from '#models/job'

/**
 * Cola de trabajos sobre PostgreSQL (sin Redis).
 * Toma trabajos con `FOR UPDATE SKIP LOCKED`, por lo que se pueden correr varios workers.
 */

export type ManejadorJob = (payload: Record<string, any>, job: Job) => Promise<void>

/** Lanzar desde un manejador para reprogramar sin contarlo como fallo definitivo. */
export class ReintentarMasTarde extends Error {
  constructor(public readonly segundos: number) {
    super(`Reprogramado en ${segundos}s`)
  }
}

const manejadores = new Map<string, ManejadorJob>()

export function registrarManejador(tipo: string, manejador: ManejadorJob) {
  manejadores.set(tipo, manejador)
}

export async function encolar(
  tipo: string,
  payload: Record<string, unknown>,
  opciones: { empresaId?: number | null; retrasoSeg?: number; maxIntentos?: number } = {}
) {
  return Job.create({
    tipo,
    payload,
    empresaId: opciones.empresaId ?? null,
    estado: 'pendiente',
    intentos: 0,
    maxIntentos: opciones.maxIntentos ?? 8,
    disponibleEn: DateTime.now().plus({ seconds: opciones.retrasoSeg ?? 0 }),
  })
}

/** Espera exponencial: 30s, 60s, 120s… con tope de 30 min. */
export function esperaReintento(intentos: number): number {
  return Math.min(30 * 2 ** Math.max(intentos - 1, 0), 1800)
}

/** Reserva y procesa hasta `limite` trabajos. Devuelve cuántos procesó. */
export async function procesarLote(limite = 10): Promise<number> {
  const reservados = await db.transaction(async (trx) => {
    const filas = await trx
      .from('jobs')
      .where('estado', 'pendiente')
      .where('disponible_en', '<=', DateTime.now().toSQL()!)
      .orderBy('disponible_en')
      .limit(limite)
      .forUpdate()
      .skipLocked()
      .select('id')
    const ids = filas.map((f) => f.id)
    if (ids.length > 0) {
      await trx
        .from('jobs')
        .whereIn('id', ids)
        .update({ estado: 'procesando', updated_at: DateTime.now().toSQL() })
    }
    return ids
  })

  for (const id of reservados) {
    const job = await Job.findOrFail(id)
    await ejecutar(job)
  }
  return reservados.length
}

async function ejecutar(job: Job) {
  const manejador = manejadores.get(job.tipo)
  job.intentos += 1
  try {
    if (!manejador) throw new Error(`No hay manejador para el trabajo "${job.tipo}"`)
    await manejador(job.payload, job)
    job.estado = 'completado'
    job.ultimoError = null
  } catch (error) {
    const reprogramar = error instanceof ReintentarMasTarde
    job.ultimoError = (error as Error).message
    if (job.intentos >= job.maxIntentos) {
      job.estado = 'fallido'
      logger.error({ job: job.id, tipo: job.tipo, error: job.ultimoError }, 'Trabajo fallido')
    } else {
      job.estado = 'pendiente'
      const segundos = reprogramar ? error.segundos : esperaReintento(job.intentos)
      job.disponibleEn = DateTime.now().plus({ seconds: segundos })
    }
  }
  await job.save()
}
