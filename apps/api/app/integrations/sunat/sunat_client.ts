import {
  RUTA_API,
  TIPO_SERIE_API,
  type FormatoImpresion,
  type TipoDocumento,
} from '#constants/sunat'
import { SunatApiError, mensajeAmigable } from './sunat_errors.js'

/**
 * Cliente HTTP ÚNICO para la API de facturación (whuauyar/plataform-api-sunat).
 * - Credenciales por empresa (cada empresa es un tenant con su api_key/api_secret).
 * - Timeout, reintentos con backoff SOLO ante red/5xx, nunca ante 4xx.
 * - Idempotency-Key en emisiones para no duplicar comprobantes al reintentar.
 * - Desenvuelve el envelope {estado, mensaje, datos} y normaliza errores a SunatApiError.
 */

export interface CredencialesSunat {
  apiKey: string
  apiSecret: string
}

export type FetchFn = typeof fetch

export interface OpcionesCliente {
  baseUrl: string
  timeoutMs?: number
  reintentos?: number
  /** Espera base entre reintentos (ms); se duplica en cada intento. */
  backoffMs?: number
  fetchImpl?: FetchFn
  esperar?: (ms: number) => Promise<void>
}

export interface Envelope<T> {
  estado: 'exito' | 'error'
  mensaje?: string
  datos: T
  meta?: unknown
}

interface OpcionesPeticion {
  metodo?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  cuerpo?: unknown
  formData?: FormData
  query?: Record<string, string | number | undefined>
  idempotencyKey?: string
  credenciales?: CredencialesSunat | null
  /** Devuelve la Response cruda (descargas binarias). */
  binario?: boolean
}

const esperarPorDefecto = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export class SunatClient {
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly reintentos: number
  private readonly backoffMs: number
  private readonly fetchImpl: FetchFn
  private readonly esperar: (ms: number) => Promise<void>

  constructor(opciones: OpcionesCliente) {
    this.baseUrl = opciones.baseUrl.replace(/\/+$/, '')
    this.timeoutMs = opciones.timeoutMs ?? 45_000
    this.reintentos = opciones.reintentos ?? 2
    this.backoffMs = opciones.backoffMs ?? 500
    this.fetchImpl = opciones.fetchImpl ?? fetch
    this.esperar = opciones.esperar ?? esperarPorDefecto
  }

  // ---------------------------------------------------------------- Empresa / configuración

  /** POST /registro (multipart, sin auth). Devuelve api_key/api_secret UNA sola vez. */
  registrarEmpresa(formData: FormData) {
    return this.datos<{
      tenant_id: number
      ruc: string
      razon_social: string
      entorno: string
      api_key: string
      api_secret: string
    }>('/registro', { metodo: 'POST', formData, credenciales: null })
  }

  obtenerEmpresa(cred: CredencialesSunat) {
    return this.datos<Record<string, any>>('/empresa', { credenciales: cred })
  }

  actualizarEmpresa(cred: CredencialesSunat, cambios: Record<string, unknown>) {
    return this.datos<Record<string, any>>('/empresa', {
      metodo: 'PUT',
      cuerpo: cambios,
      credenciales: cred,
    })
  }

  listarSucursales(cred: CredencialesSunat) {
    return this.datos<
      Array<{ id: number; nombre: string; cod_local: string; es_principal: boolean }>
    >('/sucursales', { credenciales: cred })
  }

  crearSucursal(
    cred: CredencialesSunat,
    datos: { nombre: string; cod_local: string; direccion: string; ubigeo: string }
  ) {
    return this.datos<{ id: number }>('/sucursales', {
      metodo: 'POST',
      cuerpo: datos,
      credenciales: cred,
    })
  }

  inicializarSeries(
    cred: CredencialesSunat,
    datos: { serie_factura: string; serie_boleta: string }
  ) {
    return this.datos<Array<{ id: number; tipo_documento: string; serie: string }>>(
      '/series/init-defaults',
      {
        metodo: 'POST',
        cuerpo: datos,
        credenciales: cred,
      }
    )
  }

  crearSerie(
    cred: CredencialesSunat,
    datos: {
      tipoDocumento: TipoDocumento
      serie: string
      sunatSucursalId?: number | null
      correlativoInicial?: number
    }
  ) {
    return this.datos<{ creadas: Array<{ id: number; serie: string }>; errores?: string[] }>(
      '/series',
      {
        metodo: 'POST',
        cuerpo: {
          tipo: TIPO_SERIE_API[datos.tipoDocumento],
          serie: datos.serie,
          sucursal_id: datos.sunatSucursalId ?? undefined,
          correlativo_inicial: datos.correlativoInicial ?? 0,
        },
        credenciales: cred,
      }
    )
  }

  buscarDocumento(cred: CredencialesSunat, tipo: string, numero: string) {
    return this.datos<Record<string, any>>('/buscar-documento', {
      query: { tipo, numero },
      credenciales: cred,
    })
  }

  // ---------------------------------------------------------------- Comprobantes

  emitir(cred: CredencialesSunat, tipo: TipoDocumento, payload: unknown, idempotencyKey: string) {
    return this.datos<Record<string, any>>(`/${RUTA_API[tipo]}`, {
      metodo: 'POST',
      cuerpo: payload,
      idempotencyKey,
      credenciales: cred,
    })
  }

  obtenerComprobante(cred: CredencialesSunat, tipo: TipoDocumento, id: number) {
    return this.datos<Record<string, any>>(`/${RUTA_API[tipo]}/${id}`, { credenciales: cred })
  }

  reenviar(cred: CredencialesSunat, tipo: TipoDocumento, id: number) {
    return this.datos<Record<string, any>>(`/${RUTA_API[tipo]}/${id}/reenviar`, {
      metodo: 'POST',
      credenciales: cred,
    })
  }

  /** Descarga PDF/XML/CDR como Response cruda para reenviarla al frontend (proxy). */
  descargar(
    cred: CredencialesSunat,
    tipo: TipoDocumento,
    id: number,
    recurso: 'pdf' | 'xml' | 'cdr',
    formato?: FormatoImpresion
  ) {
    return this.peticion<Response>(`/${RUTA_API[tipo]}/${id}/${recurso}`, {
      credenciales: cred,
      query: recurso === 'pdf' ? { format: formato } : undefined,
      binario: true,
    })
  }

  // ---------------------------------------------------------------- Núcleo HTTP

  private async datos<T>(ruta: string, opciones: OpcionesPeticion): Promise<T> {
    const envelope = await this.peticion<Envelope<T>>(ruta, opciones)
    return envelope.datos
  }

  async peticion<T>(ruta: string, opciones: OpcionesPeticion): Promise<T> {
    let intento = 0
    for (;;) {
      try {
        return await this.unaPeticion<T>(ruta, opciones)
      } catch (error) {
        const sunatError = error instanceof SunatApiError ? error : this.errorDeRed(error)
        if (!sunatError.esReintentable || intento >= this.reintentos) throw sunatError
        await this.esperar(this.backoffMs * 2 ** intento)
        intento++
      }
    }
  }

  private construirUrl(ruta: string, query?: OpcionesPeticion['query']): string {
    const url = new URL(`${this.baseUrl}${ruta}`)
    for (const [clave, valor] of Object.entries(query ?? {})) {
      if (valor !== undefined && valor !== '') url.searchParams.set(clave, String(valor))
    }
    return url.toString()
  }

  private async unaPeticion<T>(ruta: string, opciones: OpcionesPeticion): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (opciones.credenciales) {
      headers['X-Api-Key'] = opciones.credenciales.apiKey
      headers['X-Api-Secret'] = opciones.credenciales.apiSecret
    }
    if (opciones.idempotencyKey) headers['Idempotency-Key'] = opciones.idempotencyKey

    let body: FormData | string | undefined
    if (opciones.formData) {
      body = opciones.formData
    } else if (opciones.cuerpo !== undefined) {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(opciones.cuerpo)
    }

    const controlador = new AbortController()
    const temporizador = setTimeout(() => controlador.abort(), this.timeoutMs)
    let respuesta: Response
    try {
      respuesta = await this.fetchImpl(this.construirUrl(ruta, opciones.query), {
        method: opciones.metodo ?? 'GET',
        headers,
        body,
        signal: controlador.signal,
      })
    } finally {
      clearTimeout(temporizador)
    }

    if (opciones.binario && respuesta.ok) return respuesta as T

    const cuerpo = await this.leerJson(respuesta)
    if (!respuesta.ok || cuerpo?.estado === 'error') {
      throw this.errorDeRespuesta(respuesta.status, cuerpo)
    }
    return cuerpo as T
  }

  private async leerJson(respuesta: Response): Promise<any> {
    const texto = await respuesta.text()
    if (!texto) return null
    try {
      return JSON.parse(texto)
    } catch {
      return { mensaje: texto.slice(0, 300) }
    }
  }

  private errorDeRespuesta(status: number, cuerpo: any): SunatApiError {
    const codigo = cuerpo?.codigo_error ?? null
    // Un 200 con estado "error" se trata como error de negocio (422) para no reintentarlo
    const statusEfectivo = status >= 200 && status < 300 ? 422 : status
    return new SunatApiError(
      mensajeAmigable(statusEfectivo, codigo, cuerpo?.mensaje ?? ''),
      statusEfectivo,
      cuerpo?.errores ?? null,
      codigo,
      cuerpo?.siguiente_accion ?? null,
      cuerpo
    )
  }

  private errorDeRed(error: unknown): SunatApiError {
    const detalle = error instanceof Error ? error.message : String(error)
    return new SunatApiError(mensajeAmigable(0, null, detalle), 0, null, 'error_red', null, {
      detalle,
    })
  }
}
