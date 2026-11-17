import { qsPlano } from '#validators/qs'
import type { HttpContext } from '@adonisjs/core/http'
import '#types/http_context'
import db from '@adonisjs/lucid/services/db'
import Categoria from '#models/categoria'
import Producto from '#models/producto'
import { categoriaValidator, listadoValidator, productoValidator } from '#validators/inventario'
import { ReglaNegocioError } from '#exceptions/regla_negocio_error'
import { auditarCtx } from '#services/auditoria_service'

/** Categorías y productos (catálogo). */
export default class CatalogoController {
  async categorias({ empresa }: HttpContext) {
    return Categoria.query().where('empresa_id', empresa.id).orderBy('nombre')
  }

  async crearCategoria(ctx: HttpContext) {
    const d = await ctx.request.validateUsing(categoriaValidator)
    if (
      await Categoria.query()
        .where('empresa_id', ctx.empresa.id)
        .whereILike('nombre', d.nombre)
        .first()
    ) {
      throw new ReglaNegocioError('La categoría ya existe.', [
        { campo: 'nombre', mensaje: 'Nombre en uso.' },
      ])
    }
    return ctx.response.created(
      await Categoria.create({
        empresaId: ctx.empresa.id,
        nombre: d.nombre,
        activo: d.activo ?? true,
      })
    )
  }

  async actualizarCategoria(ctx: HttpContext) {
    const categoria = await Categoria.query()
      .where({ id: ctx.params.id, empresaId: ctx.empresa.id })
      .firstOrFail()
    const d = await ctx.request.validateUsing(categoriaValidator)
    categoria.merge({ nombre: d.nombre, activo: d.activo ?? categoria.activo })
    await categoria.save()
    return categoria
  }

  /** Productos con stock total y valorizado (suma de almacenes). */
  async productos({ empresa, request }: HttpContext) {
    const f = await request.validateUsing(listadoValidator, { data: qsPlano(request.qs()) })
    const filtroAlmacen = f.almacen_id ? 'and almacen_id = ?' : ''
    const enlaces = f.almacen_id ? [empresa.id, f.almacen_id] : [empresa.id]
    const q = db
      .from('productos as p')
      .joinRaw(
        `left join (select producto_id, sum(cantidad) as stock, sum(cantidad * costo_promedio) as valor
           from stock where empresa_id = ? ${filtroAlmacen} group by producto_id) s on s.producto_id = p.id`,
        enlaces
      )
      .leftJoin('categorias as c', 'c.id', 'p.categoria_id')
      .where('p.empresa_id', empresa.id)
      .select(
        'p.*',
        'c.nombre as categoria',
        db.raw('coalesce(s.stock, 0)::float as stock'),
        db.raw('coalesce(s.valor, 0)::float as valor_stock')
      )
    if (f.buscar) {
      const t = `%${f.buscar}%`
      q.where((w) =>
        w
          .whereILike('p.nombre', t)
          .orWhereILike('p.codigo', t)
          .orWhere('p.codigo_barras', f.buscar!)
      )
    }
    if (f.categoria_id) q.where('p.categoria_id', f.categoria_id)
    if (f.estado === 'activos') q.where('p.activo', true)
    if (f.solo_bajo_minimo)
      q.where('p.controla_stock', true).whereRaw('coalesce(s.stock, 0) <= p.stock_minimo')
    const pagina = await q.orderBy('p.nombre').paginate(f.pagina ?? 1, f.por_pagina ?? 50)
    const json = pagina.toJSON()
    return {
      meta: json.meta,
      data: json.data.map((p: any) => ({
        ...p,
        precio_venta: Number(p.precio_venta),
        stock_minimo: Number(p.stock_minimo),
      })),
    }
  }

  async producto({ empresa, params }: HttpContext) {
    const producto = await Producto.query()
      .where({ id: params.id, empresaId: empresa.id })
      .firstOrFail()
    const stock = await db
      .from('stock as s')
      .join('almacenes as a', 'a.id', 's.almacen_id')
      .where('s.producto_id', producto.id)
      .select(
        'a.id as almacen_id',
        'a.nombre as almacen',
        db.raw('s.cantidad::float as cantidad'),
        db.raw('s.costo_promedio::float as costo_promedio')
      )
    return { ...producto.serialize(), stock }
  }

  async crearProducto(ctx: HttpContext) {
    const d = await ctx.request.validateUsing(productoValidator)
    await this.validar(ctx.empresa.id, d)
    const producto = await Producto.create({ ...this.mapear(d), empresaId: ctx.empresa.id })
    await auditarCtx(ctx, 'producto.crear', 'producto', producto.id, { despues: d })
    return ctx.response.created(producto)
  }

  async actualizarProducto(ctx: HttpContext) {
    const producto = await Producto.query()
      .where({ id: ctx.params.id, empresaId: ctx.empresa.id })
      .firstOrFail()
    const d = await ctx.request.validateUsing(productoValidator)
    await this.validar(ctx.empresa.id, d, producto.id)
    const antes = producto.serialize()
    producto.merge(this.mapear(d))
    await producto.save()
    await auditarCtx(ctx, 'producto.actualizar', 'producto', producto.id, { antes, despues: d })
    return producto
  }

  private mapear(d: Awaited<ReturnType<typeof productoValidator.validate>>) {
    return {
      codigo: d.codigo,
      codigoBarras: d.codigo_barras ?? null,
      nombre: d.nombre,
      descripcion: d.descripcion ?? null,
      categoriaId: d.categoria_id ?? null,
      unidad: d.unidad,
      tipAfeIgv: d.tip_afe_igv,
      controlaStock: d.unidad === 'ZZ' ? false : d.controla_stock,
      precioVenta: d.precio_venta,
      stockMinimo: d.stock_minimo ?? 0,
      activo: d.activo ?? true,
    }
  }

  private async validar(
    empresaId: number,
    d: { codigo: string; categoria_id?: number | null },
    excluirId?: number
  ) {
    const q = Producto.query().where({ empresaId, codigo: d.codigo })
    if (excluirId) q.whereNot('id', excluirId)
    if (await q.first())
      throw new ReglaNegocioError('El código ya existe.', [
        { campo: 'codigo', mensaje: 'Código en uso.' },
      ])
    if (
      d.categoria_id &&
      !(await Categoria.query().where({ id: d.categoria_id, empresaId }).first())
    ) {
      throw new ReglaNegocioError('Categoría no válida.', [
        { campo: 'categoria_id', mensaje: 'Inexistente.' },
      ])
    }
  }
}
