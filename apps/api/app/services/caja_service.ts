import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { ReglaNegocioError } from '#exceptions/regla_negocio_error'
import { redondearMonto } from '#domain/kardex'
import AperturaCaja from '#models/apertura_caja'
import Caja from '#models/caja'
import MovimientoCaja from '#models/movimiento_caja'

/** Apertura abierta de una caja de la empresa (con su caja precargada) o error 422. */
export async function aperturaAbiertaDeCaja(empresaId: number, cajaId: number) {
  const apertura = await AperturaCaja.query()
    .where({ empresaId, cajaId, estado: 'abierta' })
    .preload('caja')
    .first()
  if (!apertura)
    throw new ReglaNegocioError('La caja no está abierta. Aperture la caja antes de operar.', [
      { campo: 'caja_id', mensaje: 'Caja cerrada.' },
    ])
  return apertura
}

export async function registrarMovimientoCaja(
  trx: TransactionClientContract,
  d: {
    empresaId: number
    aperturaId: number
    tipo: 'ingreso' | 'egreso'
    concepto: string
    metodo: string
    monto: number
    ventaId?: number
    cobroId?: number
    usuarioId: number
  }
) {
  return MovimientoCaja.create(
    {
      empresaId: d.empresaId,
      aperturaCajaId: d.aperturaId,
      tipo: d.tipo,
      concepto: d.concepto,
      metodo: d.metodo,
      monto: d.monto,
      ventaId: d.ventaId ?? null,
      cobroId: d.cobroId ?? null,
      createdBy: d.usuarioId,
    },
    { client: trx }
  )
}

/** Totales por método y efectivo esperado (inicial + ingresos − egresos en efectivo). */
export async function resumenApertura(apertura: AperturaCaja) {
  const filas = await db
    .from('movimientos_caja')
    .where('apertura_caja_id', apertura.id)
    .groupBy('metodo', 'tipo')
    .select('metodo', 'tipo')
    .sum('monto as total')
  const porMetodo: Record<string, { ingresos: number; egresos: number }> = {}
  for (const f of filas) {
    porMetodo[f.metodo] ??= { ingresos: 0, egresos: 0 }
    porMetodo[f.metodo][f.tipo === 'ingreso' ? 'ingresos' : 'egresos'] = Number(f.total)
  }
  const efectivo = porMetodo.efectivo ?? { ingresos: 0, egresos: 0 }
  return {
    por_metodo: porMetodo,
    efectivo_esperado: redondearMonto(apertura.montoInicial + efectivo.ingresos - efectivo.egresos),
  }
}

export class CajaService {
  async abrir(empresaId: number, usuarioId: number, cajaId: number, montoInicial: number) {
    return db.transaction(async (trx) => {
      const caja = await Caja.query({ client: trx })
        .where({ id: cajaId, empresaId, activo: true })
        .forUpdate()
        .first()
      if (!caja)
        throw new ReglaNegocioError('Caja no válida.', [
          { campo: 'caja_id', mensaje: 'Inexistente o inactiva.' },
        ])
      const abierta = await AperturaCaja.query({ client: trx })
        .where({ cajaId, estado: 'abierta' })
        .first()
      if (abierta) throw new ReglaNegocioError('La caja ya está abierta.')
      return AperturaCaja.create(
        {
          empresaId,
          cajaId,
          usuarioId,
          abiertaEn: DateTime.now(),
          montoInicial,
          estado: 'abierta',
        },
        { client: trx }
      )
    })
  }

  async movimiento(
    empresaId: number,
    usuarioId: number,
    aperturaId: number,
    d: { tipo: 'ingreso' | 'egreso'; concepto: string; monto: number }
  ) {
    const apertura = await AperturaCaja.query()
      .where({ id: aperturaId, empresaId, estado: 'abierta' })
      .first()
    if (!apertura) throw new ReglaNegocioError('La caja no está abierta.')
    if (d.tipo === 'egreso') {
      const { efectivo_esperado: disponible } = await resumenApertura(apertura)
      if (d.monto > disponible)
        throw new ReglaNegocioError('No hay suficiente efectivo en caja.', [
          { campo: 'monto', mensaje: `Disponible: ${disponible}.` },
        ])
    }
    return db.transaction((trx) =>
      registrarMovimientoCaja(trx, {
        empresaId,
        aperturaId,
        tipo: d.tipo,
        concepto: d.concepto,
        metodo: 'efectivo',
        monto: d.monto,
        usuarioId,
      })
    )
  }

  async cerrar(
    empresaId: number,
    aperturaId: number,
    montoDeclarado: number,
    observacion?: string | null
  ) {
    const apertura = await AperturaCaja.query().where({ id: aperturaId, empresaId }).firstOrFail()
    if (apertura.estado !== 'abierta') throw new ReglaNegocioError('La caja ya está cerrada.')
    const { efectivo_esperado: esperado } = await resumenApertura(apertura)
    apertura.merge({
      cerradaEn: DateTime.now(),
      montoEsperado: esperado,
      montoDeclarado,
      diferencia: redondearMonto(montoDeclarado - esperado),
      observacion: observacion ?? null,
      estado: 'cerrada',
    })
    await apertura.save()
    return apertura
  }
}
