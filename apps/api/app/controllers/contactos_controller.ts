import { qsPlano } from '#validators/qs'
import { paginar } from '#services/paginacion'
import type { HttpContext } from '@adonisjs/core/http'
import '#types/http_context'
import Cliente from '#models/cliente'
import Proveedor from '#models/proveedor'
import { contactoValidator, listadoValidator } from '#validators/inventario'
import { ReglaNegocioError } from '#exceptions/regla_negocio_error'
import { esDniValido, esRucValido } from '#domain/reglas_comprobante'

type ModeloContacto = typeof Cliente | typeof Proveedor

/** CRUD común para clientes y proveedores. */
function crear(Modelo: ModeloContacto, nombre: string) {
  return class ContactosController {
    async index({ empresa, request }: HttpContext) {
      const f = await request.validateUsing(listadoValidator, { data: qsPlano(request.qs()) })
      const q = Modelo.query().where('empresa_id', empresa.id)
      if (f.buscar) {
        const t = `%${f.buscar}%`
        q.where((w) => w.whereILike('razon_social', t).orWhere('num_doc', 'like', `${f.buscar}%`))
      }
      if (f.estado === 'activos') q.where('activo', true)
      return await paginar(q.orderBy('razon_social'), f.pagina ?? 1, f.por_pagina ?? 50)
    }

    async store(ctx: HttpContext) {
      const d = await ctx.request.validateUsing(contactoValidator)
      await validar(ctx.empresa.id, d)
      const contacto = await Modelo.create({ ...mapear(d), empresaId: ctx.empresa.id })
      return ctx.response.created(contacto)
    }

    async update(ctx: HttpContext) {
      const contacto = await Modelo.query()
        .where({ id: ctx.params.id, empresaId: ctx.empresa.id })
        .firstOrFail()
      const d = await ctx.request.validateUsing(contactoValidator)
      await validar(ctx.empresa.id, d, contacto.id)
      contacto.merge(mapear(d))
      await contacto.save()
      return contacto
    }
  }

  async function validar(
    empresaId: number,
    d: { tipo_doc: string; num_doc: string },
    excluirId?: number
  ) {
    if (d.tipo_doc === '6' && !esRucValido(d.num_doc))
      throw new ReglaNegocioError('RUC inválido.', [
        { campo: 'num_doc', mensaje: 'RUC de 11 dígitos.' },
      ])
    if (d.tipo_doc === '1' && !esDniValido(d.num_doc))
      throw new ReglaNegocioError('DNI inválido.', [
        { campo: 'num_doc', mensaje: 'DNI de 8 dígitos.' },
      ])
    const q = Modelo.query().where({ empresaId, tipoDoc: d.tipo_doc, numDoc: d.num_doc })
    if (excluirId) q.whereNot('id', excluirId)
    if (d.tipo_doc !== '0' && (await q.first())) {
      throw new ReglaNegocioError(`El ${nombre} ya está registrado.`, [
        { campo: 'num_doc', mensaje: 'Documento duplicado.' },
      ])
    }
  }

  function mapear(d: Awaited<ReturnType<typeof contactoValidator.validate>>) {
    return {
      tipoDoc: d.tipo_doc,
      numDoc: d.num_doc,
      razonSocial: d.razon_social,
      nombreComercial: d.nombre_comercial ?? null,
      direccion: d.direccion ?? null,
      ubigeo: d.ubigeo ?? null,
      email: d.email ?? null,
      telefono: d.telefono ?? null,
      activo: d.activo ?? true,
    }
  }
}

export const ClientesController = crear(Cliente, 'cliente')
export const ProveedoresController = crear(Proveedor, 'proveedor')
