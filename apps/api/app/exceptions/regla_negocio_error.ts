import type { ErrorRegla } from '#domain/reglas_comprobante'

/** Error de regla de negocio (422) con detalle por campo. */
export class ReglaNegocioError extends Error {
  constructor(
    message: string,
    public readonly errores: ErrorRegla[] = [],
    public readonly status = 422
  ) {
    super(message)
    this.name = 'ReglaNegocioError'
  }
}
