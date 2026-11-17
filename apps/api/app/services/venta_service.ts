import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { ReglaNegocioError } from '#exceptions/regla_negocio_error'
import { SunatApiError } from '#integrations/sunat/sunat_errors'
import { estadoCuota, redondearMonto } from '#domain/kardex'
import type { ClienteComprobante, ItemComprobante } from '#domain/reglas_comprobante'
import {
  almacenDeEmpresa,
  productosDeEmpresa,
  registrarMovimiento,
} from '#services/inventario_service'
import { ComprobanteService } from '#services/comprobante_service'
import { aperturaAbiertaDeCaja, registrarMovimientoCaja } from '#services/caja_service'
import Almacen from '#models/almacen'
import Cliente from '#models/cliente'
import Cobro from '#models/cobro'
import CuentaCobrar from '#models/cuenta_cobrar'
import Empresa from '#models/empresa'
import Venta from '#models/venta'
import VentaItem from '#models/venta_item'
import VentaPago from '#models/venta_pago'

export const METODOS_PAGO = [
  'efectivo',
  'yape',
  'plin',
  'transferencia',
  'tarjeta',
  'cheque',
  'otro',
] as const
export type MetodoPago = (typeof METODOS_PAGO)[number]

export interface DatosVenta {
  tipoDocumento: '01' | '03'
  serie?: string
  almacenId?: number
  cajaId?: number | null
  clienteId?: number | null
  cliente?: ClienteComprobante
  moneda: 'PEN' | 'USD'
  formaPago: 'Contado' | 'Credito'
  cuotas?: Array<{ monto: number; fecha_pago: string }>
  items: Array<{
    productoId: number
    cantidad: number
    precioUnitario?: number
    descuento?: number
  }>
  pagos?: Array<{ metodo: MetodoPago; monto: number; referencia?: string | null }>
}

const CLIENTES_VARIOS: ClienteComprobante = {
  tipo_doc: '0',
  num_doc: '00000000',
  razon_social: 'CLIENTES VARIOS',
}

export class VentaService {
  private comprobantes = new ComprobanteService()

  /**
   * Venta completa (POS):
   * 1) valida reglas fiscales y serie sin efectos, 2) en UNA transacción: venta, ítems, salida de stock
   *    al costo promedio, pagos/caja y cuotas por cobrar, 3) emite el comprobante en SUNAT.
   * Si la API rechaza el comprobante por validación, la venta se revierte (stock y cuentas) y se informa el error.
   */
  async registrar(empresa: Empresa, usuarioId: number, permisos: Set<string>, d: DatosVenta) {
    const cliente = await this.resolverCliente(empresa.id, d)
    const productos = await productosDeEmpresa(
      empresa.id,
      d.items.map((i) => i.productoId)
    )

    // Precios finales (con IGV) y control de descuentos
    let totalDescuentos = 0
    const lineas = d.items.map((i) => {
      const p = productos.get(i.productoId)!
      const precioLista = i.precioUnitario ?? p.precioVenta
      const descuento = redondearMonto(i.descuento ?? 0)
      const bruto = i.cantidad * precioLista
      if (descuento < 0 || descuento > bruto) {
        throw new ReglaNegocioError('Descuento no válido.', [
          { campo: 'items', mensaje: `El descuento de "${p.nombre}" supera el importe.` },
        ])
      }
      if ((descuento > 0 || precioLista < p.precioVenta) && !permisos.has('ventas.descuento')) {
        throw new ReglaNegocioError('No tiene permiso para aplicar descuentos ni bajar precios.', [
          { campo: 'items', mensaje: p.nombre },
        ])
      }
      totalDescuentos += descuento
      const precioUnitario = Math.round(((bruto - descuento) / i.cantidad) * 1e6) / 1e6
      return { producto: p, cantidad: i.cantidad, precioLista, descuento, precioUnitario }
    })

    const itemsComprobante: ItemComprobante[] = lineas.map((l) => ({
      codigo: l.producto.codigo,
      descripcion: l.producto.nombre,
      unidad: l.producto.unidad,
      cantidad: l.cantidad,
      precio_unitario: l.precioUnitario,
      tip_afe_igv: l.producto.tipAfeIgv,
    }))

    // Caja y almacén
    let aperturaId: number | null = null
    let sucursalId: number | undefined
    if (d.cajaId) {
      const apertura = await aperturaAbiertaDeCaja(empresa.id, d.cajaId)
      aperturaId = apertura.id
      sucursalId = apertura.caja.sucursalId
    }
    const almacen = d.almacenId
      ? await almacenDeEmpresa(empresa.id, d.almacenId)
      : await Almacen.query()
          .where({ empresaId: empresa.id, activo: true })
          .if(sucursalId, (q) => q.where('sucursal_id', sucursalId!))
          .orderBy('id')
          .firstOrFail()
    sucursalId ??= almacen.sucursalId

    const datosComprobante = {
      tipoDocumento: d.tipoDocumento,
      serie: d.serie,
      sucursalId,
      moneda: d.moneda,
      formaPago: d.formaPago,
      cuotas: d.cuotas,
      cliente,
      items: itemsComprobante,
    }
    const { serie, totales } = await this.comprobantes.validarVenta(empresa, datosComprobante)

    const pagos = this.validarPagos(d, totales.total)

    const venta = await db.transaction(async (trx) => {
      const nueva = await Venta.create(
        {
          empresaId: empresa.id,
          sucursalId: serie.sucursalId ?? sucursalId!,
          almacenId: almacen.id,
          cajaId: d.cajaId ?? null,
          aperturaCajaId: aperturaId,
          clienteId: d.clienteId ?? null,
          clienteTipoDoc: cliente.tipo_doc,
          clienteNumDoc: cliente.num_doc,
          clienteRazonSocial: cliente.razon_social,
          clienteDireccion: cliente.direccion ?? null,
          tipoDocumento: d.tipoDocumento,
          fecha: DateTime.now().setZone('America/Lima'),
          moneda: d.moneda,
          formaPago: d.formaPago,
          totalGravadas: totales.gravadas,
          totalIgv: totales.igv,
          totalDescuentos: redondearMonto(totalDescuentos),
          total: totales.total,
          costoTotal: 0,
          vuelto: pagos.vuelto,
          estado: 'completada',
          createdBy: usuarioId,
        },
        { client: trx }
      )

      let costoTotal = 0
      for (const l of lineas) {
        let costoUnitario = 0
        if (l.producto.controlaStock) {
          const r = await registrarMovimiento(trx, {
            empresaId: empresa.id,
            almacenId: almacen.id,
            productoId: l.producto.id,
            tipo: 'salida',
            motivo: 'venta',
            cantidad: l.cantidad,
            documentoTipo: 'venta',
            documentoId: nueva.id,
            referencia: `V-${nueva.id}`,
            usuarioId,
            permitirNegativo: empresa.permitirVentaSinStock,
          })
          costoUnitario = r.costoUnitario
          costoTotal += r.costoTotal
        }
        await VentaItem.create(
          {
            ventaId: nueva.id,
            productoId: l.producto.id,
            codigo: l.producto.codigo,
            descripcion: l.producto.nombre,
            unidad: l.producto.unidad,
            cantidad: l.cantidad,
            precioLista: l.precioLista,
            descuento: l.descuento,
            precioUnitario: l.precioUnitario,
            tipAfeIgv: l.producto.tipAfeIgv,
            subtotal: redondearMonto(l.cantidad * l.precioUnitario),
            costoUnitario,
            cantidadDevuelta: 0,
          },
          { client: trx }
        )
      }
      nueva.useTransaction(trx)
      nueva.costoTotal = redondearMonto(costoTotal)
      await nueva.save()

      for (const pago of pagos.lista) {
        await VentaPago.create(
          {
            ventaId: nueva.id,
            metodo: pago.metodo,
            monto: pago.monto,
            referencia: pago.referencia ?? null,
          },
          { client: trx }
        )
        if (aperturaId) {
          await registrarMovimientoCaja(trx, {
            empresaId: empresa.id,
            aperturaId,
            tipo: 'ingreso',
            concepto: `Venta V-${nueva.id}`,
            metodo: pago.metodo,
            // En efectivo ingresa lo cobrado menos el vuelto entregado
            monto:
              pago.metodo === 'efectivo' ? redondearMonto(pago.monto - pagos.vuelto) : pago.monto,
            ventaId: nueva.id,
            usuarioId,
          })
        }
      }

      for (const [i, c] of (d.formaPago === 'Credito' ? d.cuotas! : []).entries()) {
        await CuentaCobrar.create(
          {
            empresaId: empresa.id,
            ventaId: nueva.id,
            clienteId: d.clienteId ?? null,
            numeroCuota: i + 1,
            fechaVencimiento: DateTime.fromISO(c.fecha_pago),
            moneda: d.moneda,
            monto: c.monto,
            saldo: c.monto,
            estado: 'pendiente',
          },
          { client: trx }
        )
      }
      return nueva
    })

    try {
      const comprobante = await this.comprobantes.emitirVenta(empresa, usuarioId, {
        ...datosComprobante,
        serie: serie.serie,
        ventaId: venta.id,
      })
      venta.comprobanteId = comprobante.id
      await venta.save()
      return { venta, comprobante }
    } catch (error) {
      if (error instanceof SunatApiError || error instanceof ReglaNegocioError) {
        await this.revertir(
          empresa,
          usuarioId,
          venta,
          'Comprobante rechazado por el servicio de facturación'
        )
      }
      throw error
    }
  }

  private async resolverCliente(empresaId: number, d: DatosVenta): Promise<ClienteComprobante> {
    if (d.clienteId) {
      const c = await Cliente.query().where({ id: d.clienteId, empresaId }).first()
      if (!c)
        throw new ReglaNegocioError('Cliente no válido.', [
          { campo: 'cliente_id', mensaje: 'Inexistente.' },
        ])
      return {
        tipo_doc: c.tipoDoc,
        num_doc: c.numDoc,
        razon_social: c.razonSocial,
        direccion: c.direccion,
      }
    }
    return d.cliente ?? CLIENTES_VARIOS
  }

  /** Contado: los pagos deben cubrir el total; solo el efectivo da vuelto. Crédito: sin pagos (se cobran como cuotas). */
  private validarPagos(d: DatosVenta, total: number) {
    const lista = d.pagos ?? []
    if (d.formaPago === 'Credito') {
      if (lista.length > 0)
        throw new ReglaNegocioError(
          'Una venta al crédito no lleva pagos; registre cobros sobre sus cuotas.'
        )
      return { lista: [], vuelto: 0 }
    }
    if (lista.length === 0) {
      throw new ReglaNegocioError('Registre al menos un pago.', [
        { campo: 'pagos', mensaje: 'Sin pagos.' },
      ])
    }
    const pagado = redondearMonto(lista.reduce((s, p) => s + p.monto, 0))
    if (pagado < total) {
      throw new ReglaNegocioError('El pago no cubre el total.', [
        { campo: 'pagos', mensaje: `Falta ${redondearMonto(total - pagado)}.` },
      ])
    }
    const vuelto = redondearMonto(pagado - total)
    const efectivo = redondearMonto(
      lista.filter((p) => p.metodo === 'efectivo').reduce((s, p) => s + p.monto, 0)
    )
    if (vuelto > efectivo) {
      throw new ReglaNegocioError('Solo el pago en efectivo puede generar vuelto.', [
        { campo: 'pagos', mensaje: 'Los pagos electrónicos superan el total.' },
      ])
    }
    return { lista, vuelto }
  }

  /**
   * Revierte una venta (anulación aceptada o comprobante rechazado al emitir):
   * devuelve al almacén lo no devuelto aún, anula cuotas pendientes y marca la venta como anulada.
   */
  async revertir(
    empresa: Empresa,
    usuarioId: number | null,
    venta: Venta,
    motivo: string,
    trxExterna?: TransactionClientContract
  ) {
    const ejecutar = async (trx: TransactionClientContract) => {
      const fila = await Venta.query({ client: trx })
        .where('id', venta.id)
        .forUpdate()
        .firstOrFail()
      if (fila.estado === 'anulada') return fila
      const items = await VentaItem.query({ client: trx }).where('venta_id', fila.id)
      const productos = await productosDeEmpresa(
        empresa.id,
        items.map((i) => i.productoId),
        trx
      ).catch(() => new Map())
      for (const item of items) {
        const pendiente = item.cantidad - item.cantidadDevuelta
        if (pendiente <= 0 || productos.get(item.productoId)?.controlaStock === false) continue
        await registrarMovimiento(trx, {
          empresaId: empresa.id,
          almacenId: fila.almacenId,
          productoId: item.productoId,
          tipo: 'entrada',
          motivo: 'anulacion_venta',
          cantidad: pendiente,
          costoUnitario: item.costoUnitario,
          documentoTipo: 'venta',
          documentoId: fila.id,
          referencia: motivo.slice(0, 60),
          usuarioId,
        })
        await VentaItem.query({ client: trx })
          .where('id', item.id)
          .update({ cantidad_devuelta: item.cantidad })
      }
      await CuentaCobrar.query({ client: trx })
        .where('venta_id', fila.id)
        .whereIn('estado', ['pendiente', 'parcial'])
        .update({ estado: 'anulada', saldo: 0 })
      fila.useTransaction(trx)
      fila.estado = 'anulada'
      await fila.save()
      return fila
    }
    return trxExterna ? ejecutar(trxExterna) : db.transaction(ejecutar)
  }

  /** Cobro de una cuota por cobrar (opcionalmente ingresando a la caja abierta). */
  async cobrar(
    empresa: Empresa,
    usuarioId: number,
    cuotaId: number,
    d: { monto: number; metodo: MetodoPago; cajaId?: number | null; referencia?: string | null }
  ) {
    const apertura = d.cajaId ? await aperturaAbiertaDeCaja(empresa.id, d.cajaId) : null
    return db.transaction(async (trx) => {
      const cuota = await CuentaCobrar.query({ client: trx })
        .where({ id: cuotaId, empresaId: empresa.id })
        .forUpdate()
        .firstOrFail()
      if (cuota.estado === 'pagada' || cuota.estado === 'anulada')
        throw new ReglaNegocioError('La cuota no tiene saldo pendiente.')
      if (d.monto > cuota.saldo)
        throw new ReglaNegocioError('El cobro supera el saldo.', [
          { campo: 'monto', mensaje: `Saldo: ${cuota.saldo}.` },
        ])
      const cobro = await Cobro.create(
        {
          empresaId: empresa.id,
          cuentaCobrarId: cuota.id,
          aperturaCajaId: apertura?.id ?? null,
          fecha: DateTime.now(),
          monto: d.monto,
          metodo: d.metodo,
          referencia: d.referencia ?? null,
          createdBy: usuarioId,
        },
        { client: trx }
      )
      if (apertura) {
        await registrarMovimientoCaja(trx, {
          empresaId: empresa.id,
          aperturaId: apertura.id,
          tipo: 'ingreso',
          concepto: `Cobro cuota ${cuota.numeroCuota} de V-${cuota.ventaId}`,
          metodo: d.metodo,
          monto: d.monto,
          cobroId: cobro.id,
          usuarioId,
        })
      }
      cuota.useTransaction(trx)
      cuota.saldo = redondearMonto(cuota.saldo - d.monto)
      cuota.estado = estadoCuota(cuota.monto, cuota.saldo)
      await cuota.save()
      return cuota
    })
  }
}
