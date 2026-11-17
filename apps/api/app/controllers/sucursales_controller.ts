import type { HttpContext } from '@adonisjs/core/http'
import '#types/http_context'
import db from '@adonisjs/lucid/services/db'
import Sucursal from '#models/sucursal'
import Almacen from '#models/almacen'
import Caja from '#models/caja'
import { SunatGateway } from '#integrations/sunat/sunat_service'
import { sucursalValidator } from '#validators/empresa'
import { auditarCtx } from '#services/auditoria_service'

export default class SucursalesController {
  async index({ empresa }: HttpContext) {
    return Sucursal.query().where('empresa_id', empresa.id).orderBy('cod_local')
  }

  /** Crea la sucursal en la API SUNAT (para series por local) y localmente con su almacén y caja. */
  async store(ctx: HttpContext) {
    const datos = await ctx.request.validateUsing(sucursalValidator)
    const repetida = await Sucursal.query()
      .where({ empresaId: ctx.empresa.id, codLocal: datos.cod_local })
      .first()
    if (repetida)
      return ctx.response.unprocessableEntity({
        mensaje: `El código de local ${datos.cod_local} ya existe.`,
      })

    const remota = await SunatGateway.cliente().crearSucursal(ctx.empresa.credenciales(), {
      nombre: datos.nombre,
      cod_local: datos.cod_local,
      direccion: datos.direccion,
      ubigeo: datos.ubigeo,
    })

    const sucursal = await db.transaction(async (trx) => {
      const nueva = await Sucursal.create(
        {
          empresaId: ctx.empresa.id,
          nombre: datos.nombre,
          codLocal: datos.cod_local,
          direccion: datos.direccion,
          ubigeo: datos.ubigeo,
          formatoImpresion: datos.formato_impresion ?? null,
          sunatSucursalId: remota.id,
          esPrincipal: false,
          activo: true,
        },
        { client: trx }
      )
      await Almacen.create(
        {
          empresaId: ctx.empresa.id,
          sucursalId: nueva.id,
          nombre: `Almacén ${datos.nombre}`,
          activo: true,
        },
        { client: trx }
      )
      await Caja.create(
        { empresaId: ctx.empresa.id, sucursalId: nueva.id, nombre: 'Caja 1', activo: true },
        { client: trx }
      )
      await auditarCtx(
        ctx,
        'sucursal.crear',
        'sucursal',
        nueva.id,
        { despues: nueva.serialize() },
        trx
      )
      return nueva
    })
    return ctx.response.created(sucursal)
  }

  async update(ctx: HttpContext) {
    const sucursal = await Sucursal.query()
      .where({ id: ctx.params.id, empresaId: ctx.empresa.id })
      .firstOrFail()
    const datos = await ctx.request.validateUsing(sucursalValidator)
    const antes = sucursal.serialize()
    // El código de local no se cambia: está ligado a la sucursal en SUNAT
    sucursal.merge({
      nombre: datos.nombre,
      direccion: datos.direccion,
      ubigeo: datos.ubigeo,
      formatoImpresion: datos.formato_impresion ?? null,
      activo: datos.activo ?? sucursal.activo,
    })
    await sucursal.save()
    await auditarCtx(ctx, 'sucursal.actualizar', 'sucursal', sucursal.id, {
      antes,
      despues: sucursal.serialize(),
    })
    return sucursal
  }
}
