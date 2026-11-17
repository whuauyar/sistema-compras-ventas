import db from '@adonisjs/lucid/services/db'
import { redondearMonto } from '#domain/kardex'
import { registrarMovimiento } from '#services/inventario_service'
import { VentaService } from '#services/venta_service'
import Comprobante from '#models/comprobante'
import CuentaCobrar from '#models/cuenta_cobrar'
import Empresa from '#models/empresa'
import Venta from '#models/venta'
import VentaItem from '#models/venta_item'

/** Motivos de NC que anulan la operación completa (Cat 09). */
const MOTIVOS_ANULAN = new Set(['01', '02', '06'])

/**
 * Efectos locales cuando SUNAT define el estado de un comprobante:
 * - NC ACEPTADA: repone stock de lo devuelto, rebaja cuentas por cobrar y, si cubre todo, anula la venta.
 * - Factura/boleta ANULADA (baja o resumen aceptado): revierte la venta (stock y cuentas).
 * Idempotente: stock_aplicado / estado de la venta evitan aplicarlo dos veces.
 */
export async function aplicarEfectos(comprobante: Comprobante) {
  if (comprobante.tipoDocumento === '07' && comprobante.sunatEstado === 'aceptado') {
    await efectosNotaCredito(comprobante)
  }
  if (
    ['01', '03'].includes(comprobante.tipoDocumento) &&
    comprobante.sunatEstado === 'anulado' &&
    comprobante.ventaId
  ) {
    const empresa = await Empresa.findOrFail(comprobante.empresaId)
    const venta = await Venta.findOrFail(comprobante.ventaId)
    await new VentaService().revertir(
      empresa,
      null,
      venta,
      `Anulación ${comprobante.numeroCompleto ?? ''}`.trim()
    )
  }
}

async function efectosNotaCredito(nota: Comprobante) {
  await db.transaction(async (trx) => {
    const fila = await Comprobante.query({ client: trx })
      .where('id', nota.id)
      .forUpdate()
      .firstOrFail()
    if (fila.stockAplicado) return

    if (fila.reponeStock && fila.detalleStock?.length) {
      for (const d of fila.detalleStock) {
        await registrarMovimiento(trx, {
          empresaId: fila.empresaId,
          almacenId: d.almacenId,
          productoId: d.productoId,
          tipo: 'entrada',
          motivo: 'devolucion_venta',
          cantidad: d.cantidad,
          costoUnitario: d.costoUnitario,
          documentoTipo: 'nota_credito',
          documentoId: fila.id,
          referencia: fila.numeroCompleto ?? `NC-${fila.id}`,
        })
        await VentaItem.query({ client: trx })
          .where('id', d.ventaItemId)
          .increment('cantidad_devuelta', d.cantidad)
      }
    }

    if (fila.ventaId) {
      const venta = await Venta.query({ client: trx })
        .where('id', fila.ventaId)
        .forUpdate()
        .firstOrFail()
      // Rebaja el saldo por cobrar desde la última cuota hacia atrás
      let porRebajar = fila.total
      const cuotas = await CuentaCobrar.query({ client: trx })
        .where('venta_id', venta.id)
        .whereIn('estado', ['pendiente', 'parcial'])
        .orderBy('numero_cuota', 'desc')
      for (const cuota of cuotas) {
        if (porRebajar <= 0) break
        const rebaja = Math.min(cuota.saldo, porRebajar)
        cuota.useTransaction(trx)
        cuota.saldo = redondearMonto(cuota.saldo - rebaja)
        cuota.estado = cuota.saldo <= 0 ? 'anulada' : 'parcial'
        await cuota.save()
        porRebajar = redondearMonto(porRebajar - rebaja)
      }
      const notas = await Comprobante.query({ client: trx })
        .where({
          docReferenciaId: fila.docReferenciaId!,
          tipoDocumento: '07',
          sunatEstado: 'aceptado',
        })
        .sum('total as t')
        .first()
      const acreditado = Number(notas?.$extras.t ?? 0)
      if (MOTIVOS_ANULAN.has(fila.codMotivo ?? '') && acreditado >= venta.total) {
        venta.useTransaction(trx)
        venta.estado = 'anulada'
        await venta.save()
      }
    }

    fila.useTransaction(trx)
    fila.stockAplicado = true
    await fila.save()
  })
}
