import { DateTime } from 'luxon'
import { ESTADOS_EN_PROCESO } from '#constants/sunat'
import { ComprobanteService } from '#services/comprobante_service'
import { ReintentarMasTarde, encolar, registrarManejador } from '#services/cola_service'
import Comprobante from '#models/comprobante'
import Empresa from '#models/empresa'
import Job from '#models/job'

/**
 * Trabajos en segundo plano de la integración SUNAT:
 * - sunat.enviar: reintenta el envío de comprobantes que no llegaron (caída de red/5xx).
 * - sunat.reconsultar: consulta el estado de comprobantes pendientes/enviados hasta que se definan.
 */
const servicio = new ComprobanteService()

async function cargar(payload: Record<string, any>) {
  const comprobante = await Comprobante.find(payload.comprobanteId)
  if (!comprobante) return null
  const empresa = await Empresa.findOrFail(comprobante.empresaId)
  return { comprobante, empresa }
}

export function registrarJobsSunat() {
  registrarManejador('sunat.enviar', async (payload) => {
    const ctx = await cargar(payload)
    if (!ctx || ctx.comprobante.sunatEstado !== 'error_envio') return
    await servicio.enviar(ctx.empresa, ctx.comprobante)
    if (ctx.comprobante.sunatEstado === 'error_envio')
      throw new Error('La API SUNAT sigue sin responder')
  })

  registrarManejador('sunat.reconsultar', async (payload) => {
    const ctx = await cargar(payload)
    if (!ctx || !ESTADOS_EN_PROCESO.includes(ctx.comprobante.sunatEstado)) return
    await servicio.reconsultar(ctx.empresa, ctx.comprobante)
    if (ESTADOS_EN_PROCESO.includes(ctx.comprobante.sunatEstado)) throw new ReintentarMasTarde(120)
  })
}

/**
 * Programador: encola reconsulta de comprobantes en proceso sin trabajo activo
 * y no consultados en los últimos 10 minutos. Lo ejecuta el worker cada 10 min.
 */
export async function programarReconsultas(): Promise<number> {
  const limite = DateTime.now().minus({ minutes: 10 }).toSQL()!
  const candidatos = await Comprobante.query()
    .whereIn('sunat_estado', ESTADOS_EN_PROCESO)
    .where((q) => q.whereNull('sunat_consultado_en').orWhere('sunat_consultado_en', '<', limite))
    .limit(500)

  let encolados = 0
  for (const c of candidatos) {
    const activo = await Job.query()
      .whereIn('estado', ['pendiente', 'procesando'])
      .where('tipo', 'sunat.reconsultar')
      .whereRaw("payload->>'comprobanteId' = ?", [String(c.id)])
      .first()
    if (!activo) {
      await encolar('sunat.reconsultar', { comprobanteId: c.id }, { empresaId: c.empresaId })
      encolados++
    }
  }
  return encolados
}
