import type { HttpContext } from '@adonisjs/core/http'
import '#types/http_context'
import vine from '@vinejs/vine'
import { SunatGateway } from '#integrations/sunat/sunat_service'

const validador = vine.compile(
  vine.object({
    tipo: vine.enum(['1', '6'] as const),
    numero: vine
      .string()
      .trim()
      .regex(/^\d{8}(\d{3})?$/),
  })
)

export default class ConsultasController {
  /** Autocompletar cliente/proveedor por DNI o RUC (vía API SUNAT). */
  async documento(ctx: HttpContext) {
    const { tipo, numero } = await ctx.request.validateUsing(validador, { data: ctx.request.qs() })
    return SunatGateway.cliente().buscarDocumento(ctx.empresa.credenciales(), tipo, numero)
  }
}
