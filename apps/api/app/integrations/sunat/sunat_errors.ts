/**
 * Error normalizado de la API SUNAT. Todo error HTTP de la API se convierte a esta forma
 * para que controladores y UI lo manejen igual.
 */
export class SunatApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly errores: Record<string, string[]> | null = null,
    public readonly codigoError: string | null = null,
    public readonly siguienteAccion: unknown = null,
    public readonly cuerpo: unknown = null
  ) {
    super(message)
    this.name = 'SunatApiError'
  }

  /** Errores de red o 5xx: se puede reintentar sin riesgo (la API es idempotente con Idempotency-Key). */
  get esReintentable(): boolean {
    return this.status === 0 || this.status >= 500
  }

  /** Respuesta que devolvemos a nuestro frontend. */
  toJSON() {
    return {
      mensaje: this.message,
      origen: 'sunat_api',
      status: this.status,
      errores: this.errores,
      codigo_error: this.codigoError,
      siguiente_accion: this.siguienteAccion,
    }
  }
}

/** Mensaje claro para errores de negocio conocidos de la API. */
export function mensajeAmigable(
  status: number,
  codigoError: string | null,
  mensaje: string
): string {
  if (status === 0)
    return 'No se pudo conectar con el servicio de facturación. Se reintentará automáticamente.'
  if (status === 401)
    return 'Las credenciales SUNAT de la empresa no son válidas. Revise la configuración.'
  if (codigoError === 'subscription_expired')
    return 'La suscripción del servicio de facturación está vencida.'
  if (codigoError === 'limit_reached')
    return 'Se alcanzó el límite de documentos del plan de facturación.'
  return mensaje || 'Error en el servicio de facturación.'
}
