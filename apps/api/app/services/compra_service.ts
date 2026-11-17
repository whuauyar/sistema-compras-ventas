import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { ReglaNegocioError } from '#exceptions/regla_negocio_error'
import { calcularTotales } from '#domain/reglas_comprobante'
import { costoDesdePrecioCompra, estadoCuota, redondearMonto, repartirCuotas } from '#domain/kardex'
import {
  almacenDeEmpresa,
  productosDeEmpresa,
  registrarMovimiento,
} from '#services/inventario_service'
import Compra from '#models/compra'
import CompraItem from '#models/compra_item'
import CuentaPagar from '#models/cuenta_pagar'
import Empresa from '#models/empresa'
import OrdenCompra from '#models/orden_compra'
import OrdenCompraItem from '#models/orden_compra_item'
import PagoProveedor from '#models/pago_proveedor'
import Proveedor from '#models/proveedor'

export interface ItemCompra {
  productoId: number
  descripcion?: string
  cantidad: number
  precioUnitario: number // con IGV
  tipAfeIgv?: string
}

export interface DatosCompra {
  proveedorId: number
  almacenId: number
  ordenCompraId?: number | null
  tipoDocumento: '01' | '03' | '12' | '00'
  serie: string
  numero: string
  fechaEmision: string
  moneda: 'PEN' | 'USD'
  tipoCambio?: number
  formaPago: 'Contado' | 'Credito'
  cuotas?: Array<{ monto: number; fechaVencimiento: string }>
  diasCredito?: number
  observacion?: string | null
  items: ItemCompra[]
}

export interface DatosOrdenCompra {
  proveedorId: number
  almacenId: number
  fecha: string
  fechaEntrega?: string | null
  moneda: 'PEN' | 'USD'
  observacion?: string | null
  items: ItemCompra[]
}

async function proveedorDeEmpresa(
  empresaId: number,
  proveedorId: number,
  trx?: TransactionClientContract
) {
  const proveedor = await Proveedor.query({ client: trx })
    .where({ id: proveedorId, empresaId })
    .first()
  if (!proveedor)
    throw new ReglaNegocioError('Proveedor no válido.', [
      { campo: 'proveedor_id', mensaje: 'Proveedor inexistente.' },
    ])
  return proveedor
}

function totalesDe(
  items: Array<{
    descripcion: string
    cantidad: number
    precioUnitario: number
    tipAfeIgv: string
  }>,
  igvTasa: number
) {
  return calcularTotales(
    items.map((i) => ({
      descripcion: i.descripcion,
      unidad: 'NIU',
      cantidad: i.cantidad,
      precio_unitario: i.precioUnitario,
      tip_afe_igv: i.tipAfeIgv,
    })),
    igvTasa
  )
}

export class CompraService {
  /**
   * Registra la compra: valida duplicado, calcula totales, ingresa stock al costo sin IGV (en PEN),
   * genera cuotas por pagar (al contado se registra el pago completo) y cierra la OC si viene de una.
   */
  async registrar(empresa: Empresa, usuarioId: number, d: DatosCompra) {
    return db.transaction(async (trx) => {
      await proveedorDeEmpresa(empresa.id, d.proveedorId, trx)
      const almacen = await almacenDeEmpresa(empresa.id, d.almacenId, trx)
      const productos = await productosDeEmpresa(
        empresa.id,
        d.items.map((i) => i.productoId),
        trx
      )

      const duplicada = await Compra.query({ client: trx })
        .where({
          empresaId: empresa.id,
          proveedorId: d.proveedorId,
          tipoDocumento: d.tipoDocumento,
          serie: d.serie,
          numero: d.numero,
        })
        .first()
      if (duplicada) {
        throw new ReglaNegocioError('Este documento del proveedor ya fue registrado.', [
          { campo: 'numero', mensaje: `Compra #${duplicada.id}.` },
        ])
      }

      let orden: OrdenCompra | null = null
      if (d.ordenCompraId) {
        orden = await OrdenCompra.query({ client: trx })
          .where({ id: d.ordenCompraId, empresaId: empresa.id })
          .forUpdate()
          .first()
        if (!orden || orden.estado !== 'aprobada') {
          throw new ReglaNegocioError('La orden de compra debe estar aprobada para recibirla.', [
            { campo: 'orden_compra_id', mensaje: 'OC no aprobada.' },
          ])
        }
      }

      const tipoCambio = d.moneda === 'PEN' ? 1 : (d.tipoCambio ?? 0)
      if (tipoCambio <= 0)
        throw new ReglaNegocioError('Indique el tipo de cambio.', [
          { campo: 'tipo_cambio', mensaje: 'Requerido para USD.' },
        ])

      const items = d.items.map((i) => {
        const p = productos.get(i.productoId)!
        return {
          ...i,
          descripcion: i.descripcion ?? p.nombre,
          tipAfeIgv: i.tipAfeIgv ?? p.tipAfeIgv,
        }
      })
      const totales = totalesDe(items, empresa.igvTasa)

      const cuotas = this.calcularCuotas(d, totales.total)

      const compra = await Compra.create(
        {
          empresaId: empresa.id,
          sucursalId: almacen.sucursalId,
          almacenId: d.almacenId,
          proveedorId: d.proveedorId,
          ordenCompraId: orden?.id ?? null,
          tipoDocumento: d.tipoDocumento,
          serie: d.serie,
          numero: d.numero,
          fechaEmision: DateTime.fromISO(d.fechaEmision),
          moneda: d.moneda,
          tipoCambio,
          formaPago: d.formaPago,
          totalGravadas: totales.gravadas,
          totalExoneradas: totales.exoneradas,
          totalInafectas: totales.inafectas,
          totalIgv: totales.igv,
          total: totales.total,
          estado: 'registrada',
          observacion: d.observacion ?? null,
          createdBy: usuarioId,
        },
        { client: trx }
      )

      const referencia = `${d.serie}-${d.numero}`
      for (const item of items) {
        const costo = costoDesdePrecioCompra(
          item.precioUnitario,
          item.tipAfeIgv,
          empresa.igvTasa,
          tipoCambio
        )
        await CompraItem.create(
          {
            compraId: compra.id,
            productoId: item.productoId,
            descripcion: item.descripcion,
            cantidad: item.cantidad,
            precioUnitario: item.precioUnitario,
            tipAfeIgv: item.tipAfeIgv,
            costoUnitario: costo,
            subtotal: redondearMonto(item.cantidad * item.precioUnitario),
          },
          { client: trx }
        )
        if (productos.get(item.productoId)!.controlaStock) {
          await registrarMovimiento(trx, {
            empresaId: empresa.id,
            almacenId: d.almacenId,
            productoId: item.productoId,
            tipo: 'entrada',
            motivo: 'compra',
            cantidad: item.cantidad,
            costoUnitario: costo,
            documentoTipo: 'compra',
            documentoId: compra.id,
            referencia,
            usuarioId,
          })
        }
      }

      for (const [i, c] of cuotas.entries()) {
        const cuota = await CuentaPagar.create(
          {
            empresaId: empresa.id,
            compraId: compra.id,
            proveedorId: d.proveedorId,
            numeroCuota: i + 1,
            fechaVencimiento: DateTime.fromISO(c.fechaVencimiento),
            moneda: d.moneda,
            monto: c.monto,
            saldo: d.formaPago === 'Contado' ? 0 : c.monto,
            estado: d.formaPago === 'Contado' ? 'pagada' : 'pendiente',
          },
          { client: trx }
        )
        if (d.formaPago === 'Contado') {
          await PagoProveedor.create(
            {
              empresaId: empresa.id,
              cuentaPagarId: cuota.id,
              fecha: DateTime.fromISO(d.fechaEmision),
              monto: c.monto,
              metodo: 'efectivo',
              referencia: 'Pago al contado',
              createdBy: usuarioId,
            },
            { client: trx }
          )
        }
      }

      if (orden) {
        orden.useTransaction(trx)
        orden.estado = 'recibida'
        await orden.save()
      }
      return compra
    })
  }

  private calcularCuotas(d: DatosCompra, total: number) {
    if (d.formaPago === 'Contado') return [{ monto: total, fechaVencimiento: d.fechaEmision }]
    if (d.cuotas?.length) {
      const suma = redondearMonto(d.cuotas.reduce((s, c) => s + c.monto, 0))
      if (suma !== total) {
        throw new ReglaNegocioError('La suma de las cuotas debe ser igual al total.', [
          { campo: 'cuotas', mensaje: `Suma ${suma} ≠ total ${total}.` },
        ])
      }
      return d.cuotas
    }
    const dias = d.diasCredito ?? 30
    return repartirCuotas(total, 1).map((monto) => ({
      monto,
      fechaVencimiento: DateTime.fromISO(d.fechaEmision).plus({ days: dias }).toISODate()!,
    }))
  }

  /** Anula una compra sin pagos a crédito: retira el stock ingresado (falla si ya se vendió). */
  async anular(empresa: Empresa, usuarioId: number, compraId: number) {
    return db.transaction(async (trx) => {
      const compra = await Compra.query({ client: trx })
        .where({ id: compraId, empresaId: empresa.id })
        .forUpdate()
        .firstOrFail()
      if (compra.estado === 'anulada') throw new ReglaNegocioError('La compra ya está anulada.')
      if (compra.formaPago === 'Credito') {
        const pagos = await db
          .from('pagos_proveedor as p')
          .join('cuentas_pagar as c', 'c.id', 'p.cuenta_pagar_id')
          .where('c.compra_id', compra.id)
          .useTransaction(trx)
          .first()
        if (pagos)
          throw new ReglaNegocioError('La compra tiene pagos registrados. Anule primero los pagos.')
      }
      const items = await CompraItem.query({ client: trx }).where('compra_id', compra.id)
      const productos = await productosDeEmpresa(
        empresa.id,
        items.map((i) => i.productoId),
        trx
      ).catch(() => new Map())
      for (const item of items) {
        if (productos.get(item.productoId)?.controlaStock === false) continue
        await registrarMovimiento(trx, {
          empresaId: empresa.id,
          almacenId: compra.almacenId,
          productoId: item.productoId,
          tipo: 'salida',
          motivo: 'anulacion_compra',
          cantidad: item.cantidad,
          documentoTipo: 'compra',
          documentoId: compra.id,
          referencia: `${compra.serie}-${compra.numero}`,
          usuarioId,
        })
      }
      await CuentaPagar.query({ client: trx })
        .where('compra_id', compra.id)
        .update({ estado: 'anulada', saldo: 0 })
      compra.useTransaction(trx)
      compra.estado = 'anulada'
      await compra.save()
      return compra
    })
  }

  /** Registra un pago a una cuota por pagar. */
  async pagar(
    empresa: Empresa,
    usuarioId: number,
    cuotaId: number,
    d: { monto: number; metodo: string; fecha?: string; referencia?: string | null }
  ) {
    return db.transaction(async (trx) => {
      const cuota = await CuentaPagar.query({ client: trx })
        .where({ id: cuotaId, empresaId: empresa.id })
        .forUpdate()
        .firstOrFail()
      if (cuota.estado === 'pagada' || cuota.estado === 'anulada')
        throw new ReglaNegocioError('La cuota no tiene saldo pendiente.')
      if (d.monto > cuota.saldo) {
        throw new ReglaNegocioError('El pago supera el saldo de la cuota.', [
          { campo: 'monto', mensaje: `Saldo: ${cuota.saldo}.` },
        ])
      }
      await PagoProveedor.create(
        {
          empresaId: empresa.id,
          cuentaPagarId: cuota.id,
          fecha: d.fecha ? DateTime.fromISO(d.fecha) : DateTime.now(),
          monto: d.monto,
          metodo: d.metodo,
          referencia: d.referencia ?? null,
          createdBy: usuarioId,
        },
        { client: trx }
      )
      cuota.useTransaction(trx)
      cuota.saldo = redondearMonto(cuota.saldo - d.monto)
      cuota.estado = estadoCuota(cuota.monto, cuota.saldo)
      await cuota.save()
      return cuota
    })
  }

  // ------------------------------------------------------------- Órdenes de compra

  async crearOrden(empresa: Empresa, usuarioId: number, d: DatosOrdenCompra) {
    return db.transaction(async (trx) => {
      await proveedorDeEmpresa(empresa.id, d.proveedorId, trx)
      const almacen = await almacenDeEmpresa(empresa.id, d.almacenId, trx)
      const productos = await productosDeEmpresa(
        empresa.id,
        d.items.map((i) => i.productoId),
        trx
      )
      const items = d.items.map((i) => {
        const p = productos.get(i.productoId)!
        return {
          ...i,
          descripcion: i.descripcion ?? p.nombre,
          tipAfeIgv: i.tipAfeIgv ?? p.tipAfeIgv,
        }
      })
      const totales = totalesDe(items, empresa.igvTasa)
      // Correlativo por empresa (bloqueo de la empresa para evitar números repetidos)
      await trx.from('empresas').where('id', empresa.id).forUpdate().first()
      const ultimo = await trx
        .from('ordenes_compra')
        .where('empresa_id', empresa.id)
        .max('numero as n')
        .first()
      const orden = await OrdenCompra.create(
        {
          empresaId: empresa.id,
          sucursalId: almacen.sucursalId,
          almacenId: d.almacenId,
          proveedorId: d.proveedorId,
          numero: Number(ultimo?.n ?? 0) + 1,
          fecha: DateTime.fromISO(d.fecha),
          fechaEntrega: d.fechaEntrega ? DateTime.fromISO(d.fechaEntrega) : null,
          moneda: d.moneda,
          estado: 'borrador',
          observacion: d.observacion ?? null,
          totalGravadas: totales.gravadas,
          totalIgv: totales.igv,
          total: totales.total,
          createdBy: usuarioId,
        },
        { client: trx }
      )
      await OrdenCompraItem.createMany(
        items.map((i) => ({
          ordenCompraId: orden.id,
          productoId: i.productoId,
          descripcion: i.descripcion,
          cantidad: i.cantidad,
          precioUnitario: i.precioUnitario,
          tipAfeIgv: i.tipAfeIgv,
          subtotal: redondearMonto(i.cantidad * i.precioUnitario),
        })),
        { client: trx }
      )
      return orden
    })
  }

  async cambiarEstadoOrden(
    empresa: Empresa,
    usuarioId: number,
    ordenId: number,
    accion: 'aprobar' | 'anular'
  ) {
    const orden = await OrdenCompra.query()
      .where({ id: ordenId, empresaId: empresa.id })
      .firstOrFail()
    if (accion === 'aprobar') {
      if (orden.estado !== 'borrador')
        throw new ReglaNegocioError('Solo se aprueban órdenes en borrador.')
      orden.merge({ estado: 'aprobada', aprobadoBy: usuarioId })
    } else {
      if (orden.estado === 'recibida' || orden.estado === 'anulada')
        throw new ReglaNegocioError('La orden ya no se puede anular.')
      orden.estado = 'anulada'
    }
    await orden.save()
    return orden
  }
}
