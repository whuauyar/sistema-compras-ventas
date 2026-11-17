import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { ReglaNegocioError } from '#exceptions/regla_negocio_error'
import {
  StockInsuficienteError,
  aplicarEntrada,
  aplicarSalida,
  type ResultadoMovimiento,
} from '#domain/kardex'
import Almacen from '#models/almacen'
import AjusteInventario from '#models/ajuste_inventario'
import AjusteInventarioItem from '#models/ajuste_inventario_item'
import MovimientoKardex from '#models/movimiento_kardex'
import Producto from '#models/producto'
import Transferencia from '#models/transferencia'
import TransferenciaItem from '#models/transferencia_item'

export type MotivoKardex =
  | 'inventario_inicial'
  | 'compra'
  | 'anulacion_compra'
  | 'venta'
  | 'devolucion_venta'
  | 'anulacion_venta'
  | 'ajuste_entrada'
  | 'ajuste_salida'
  | 'merma'
  | 'transferencia_entrada'
  | 'transferencia_salida'

export interface DatosMovimiento {
  empresaId: number
  almacenId: number
  productoId: number
  tipo: 'entrada' | 'salida'
  motivo: MotivoKardex
  cantidad: number
  /** Obligatorio en entradas (sin IGV, en PEN). En salidas se usa el costo promedio. */
  costoUnitario?: number
  documentoTipo?: string
  documentoId?: number
  referencia?: string
  usuarioId?: number | null
  permitirNegativo?: boolean
}

/**
 * Registra un movimiento de kardex y actualiza el saldo del almacén.
 * Bloquea la fila de stock (FOR UPDATE) para que dos ventas simultáneas no corrompan el saldo.
 */
export async function registrarMovimiento(
  trx: TransactionClientContract,
  d: DatosMovimiento
): Promise<ResultadoMovimiento> {
  await trx
    .insertQuery()
    .table('stock')
    .insert({
      empresa_id: d.empresaId,
      almacen_id: d.almacenId,
      producto_id: d.productoId,
      cantidad: 0,
      costo_promedio: 0,
      created_at: DateTime.now().toSQL(),
    })
    .knexQuery.onConflict(['almacen_id', 'producto_id'])
    .ignore()

  const fila = await trx
    .from('stock')
    .where({ almacen_id: d.almacenId, producto_id: d.productoId })
    .forUpdate()
    .firstOrFail()
  const saldo = { cantidad: Number(fila.cantidad), costoPromedio: Number(fila.costo_promedio) }

  let resultado: ResultadoMovimiento
  try {
    resultado =
      d.tipo === 'entrada'
        ? aplicarEntrada(saldo, d.cantidad, d.costoUnitario ?? saldo.costoPromedio)
        : aplicarSalida(saldo, d.cantidad, d.permitirNegativo)
  } catch (error) {
    if (error instanceof StockInsuficienteError) {
      const producto = await Producto.find(d.productoId, { client: trx })
      throw new ReglaNegocioError(`Stock insuficiente de "${producto?.nombre ?? d.productoId}".`, [
        {
          campo: 'items',
          mensaje: `Disponible: ${error.disponible}. Solicitado: ${error.solicitado}.`,
        },
      ])
    }
    throw error
  }

  await trx.from('stock').where('id', fila.id).update({
    cantidad: resultado.saldo.cantidad,
    costo_promedio: resultado.saldo.costoPromedio,
    updated_at: DateTime.now().toSQL(),
  })

  await MovimientoKardex.create(
    {
      empresaId: d.empresaId,
      almacenId: d.almacenId,
      productoId: d.productoId,
      fecha: DateTime.now(),
      tipo: d.tipo,
      motivo: d.motivo,
      documentoTipo: d.documentoTipo ?? null,
      documentoId: d.documentoId ?? null,
      referencia: d.referencia ?? null,
      cantidad: d.cantidad,
      costoUnitario: resultado.costoUnitario,
      costoTotal: resultado.costoTotal,
      saldoCantidad: resultado.saldo.cantidad,
      saldoCostoPromedio: resultado.saldo.costoPromedio,
      saldoValor: resultado.saldoValor,
      createdBy: d.usuarioId ?? null,
    },
    { client: trx }
  )
  return resultado
}

/** Verifica que el almacén pertenezca a la empresa. */
export async function almacenDeEmpresa(
  empresaId: number,
  almacenId: number,
  trx?: TransactionClientContract
) {
  const almacen = await Almacen.query({ client: trx })
    .where({ id: almacenId, empresaId, activo: true })
    .first()
  if (!almacen)
    throw new ReglaNegocioError('Almacén no válido.', [
      { campo: 'almacen_id', mensaje: 'Almacén inexistente o inactivo.' },
    ])
  return almacen
}

/** Carga los productos pedidos verificando que pertenezcan a la empresa y estén activos. */
export async function productosDeEmpresa(
  empresaId: number,
  ids: number[],
  trx?: TransactionClientContract
) {
  const unicos = [...new Set(ids)]
  const productos = await Producto.query({ client: trx })
    .where('empresa_id', empresaId)
    .where('activo', true)
    .whereIn('id', unicos)
  if (productos.length !== unicos.length) {
    const encontrados = new Set(productos.map((p) => p.id))
    throw new ReglaNegocioError(
      'Hay productos inválidos.',
      unicos
        .filter((id) => !encontrados.has(id))
        .map((id) => ({ campo: 'items', mensaje: `Producto ${id} inexistente o inactivo.` }))
    )
  }
  return new Map(productos.map((p) => [p.id, p]))
}

export interface DatosAjuste {
  almacenId: number
  tipo: 'entrada' | 'salida'
  motivo: 'inventario_inicial' | 'ajuste' | 'merma' | 'otro'
  observacion?: string | null
  items: Array<{ productoId: number; cantidad: number; costoUnitario?: number }>
}

/** Ajuste de inventario (inventario inicial, conteo físico, merma). */
export async function ajustar(
  trx: TransactionClientContract,
  empresaId: number,
  usuarioId: number,
  d: DatosAjuste
) {
  await almacenDeEmpresa(empresaId, d.almacenId, trx)
  const productos = await productosDeEmpresa(
    empresaId,
    d.items.map((i) => i.productoId),
    trx
  )
  if (d.tipo === 'entrada' && d.items.some((i) => i.costoUnitario === undefined)) {
    throw new ReglaNegocioError('Las entradas requieren costo unitario.', [
      { campo: 'items', mensaje: 'Indique el costo unitario.' },
    ])
  }
  const ajuste = await AjusteInventario.create(
    {
      empresaId,
      almacenId: d.almacenId,
      tipo: d.tipo,
      motivo: d.motivo,
      observacion: d.observacion ?? null,
      fecha: DateTime.now(),
      createdBy: usuarioId,
    },
    { client: trx }
  )
  const motivoKardex: MotivoKardex =
    d.motivo === 'inventario_inicial'
      ? 'inventario_inicial'
      : d.motivo === 'merma'
        ? 'merma'
        : d.tipo === 'entrada'
          ? 'ajuste_entrada'
          : 'ajuste_salida'

  for (const item of d.items) {
    const producto = productos.get(item.productoId)!
    if (!producto.controlaStock) {
      throw new ReglaNegocioError(`"${producto.nombre}" no controla stock.`)
    }
    const r = await registrarMovimiento(trx, {
      empresaId,
      almacenId: d.almacenId,
      productoId: item.productoId,
      tipo: d.tipo,
      motivo: motivoKardex,
      cantidad: item.cantidad,
      costoUnitario: item.costoUnitario,
      documentoTipo: 'ajuste',
      documentoId: ajuste.id,
      referencia: `AJ-${ajuste.id}`,
      usuarioId,
    })
    await AjusteInventarioItem.create(
      {
        ajusteId: ajuste.id,
        productoId: item.productoId,
        cantidad: item.cantidad,
        costoUnitario: r.costoUnitario,
      },
      { client: trx }
    )
  }
  return ajuste
}

export interface DatosTransferencia {
  almacenOrigenId: number
  almacenDestinoId: number
  observacion?: string | null
  items: Array<{ productoId: number; cantidad: number }>
}

/** Traslado entre almacenes: sale al costo promedio del origen y entra con ese mismo costo al destino. */
export async function transferir(
  trx: TransactionClientContract,
  empresaId: number,
  usuarioId: number,
  d: DatosTransferencia
) {
  if (d.almacenOrigenId === d.almacenDestinoId) {
    throw new ReglaNegocioError('El almacén de origen y destino deben ser distintos.')
  }
  await almacenDeEmpresa(empresaId, d.almacenOrigenId, trx)
  await almacenDeEmpresa(empresaId, d.almacenDestinoId, trx)
  await productosDeEmpresa(
    empresaId,
    d.items.map((i) => i.productoId),
    trx
  )

  const transferencia = await Transferencia.create(
    {
      empresaId,
      almacenOrigenId: d.almacenOrigenId,
      almacenDestinoId: d.almacenDestinoId,
      observacion: d.observacion ?? null,
      fecha: DateTime.now(),
      createdBy: usuarioId,
    },
    { client: trx }
  )
  const ref = `TR-${transferencia.id}`
  for (const item of d.items) {
    const salida = await registrarMovimiento(trx, {
      empresaId,
      almacenId: d.almacenOrigenId,
      productoId: item.productoId,
      tipo: 'salida',
      motivo: 'transferencia_salida',
      cantidad: item.cantidad,
      documentoTipo: 'transferencia',
      documentoId: transferencia.id,
      referencia: ref,
      usuarioId,
    })
    await registrarMovimiento(trx, {
      empresaId,
      almacenId: d.almacenDestinoId,
      productoId: item.productoId,
      tipo: 'entrada',
      motivo: 'transferencia_entrada',
      cantidad: item.cantidad,
      costoUnitario: salida.costoUnitario,
      documentoTipo: 'transferencia',
      documentoId: transferencia.id,
      referencia: ref,
      usuarioId,
    })
    await TransferenciaItem.create(
      {
        transferenciaId: transferencia.id,
        productoId: item.productoId,
        cantidad: item.cantidad,
        costoUnitario: salida.costoUnitario,
      },
      { client: trx }
    )
  }
  return transferencia
}
