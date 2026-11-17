import { almacen } from './utils'

const BASE = `${import.meta.env.VITE_API_URL ?? ''}/api/v1`

export interface ErrorCampo {
  campo: string
  mensaje: string
}

/** Error uniforme del backend: {mensaje, errores[]} o error SUNAT {mensaje, errores{}, codigo_error, siguiente_accion}. */
export class ApiError extends Error {
  status: number
  errores: ErrorCampo[]
  codigoError: string | null
  siguienteAccion: unknown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cuerpo libre del backend
  constructor(status: number, cuerpo: any) {
    super(cuerpo?.mensaje ?? 'Ocurrió un error inesperado.')
    this.status = status
    this.codigoError = cuerpo?.codigo_error ?? null
    this.siguienteAccion = cuerpo?.siguiente_accion ?? null
    const e = cuerpo?.errores
    this.errores = Array.isArray(e)
      ? e
      : e && typeof e === 'object'
        ? Object.entries(e).map(([campo, msgs]) => ({ campo, mensaje: ([] as string[]).concat(msgs as string | string[]).join(' ') }))
        : []
  }
}

let token: string | null = almacen.leer('scv.token')
let empresaId: string | null = almacen.leer('scv.empresa')
let alExpirar: () => void = () => {}

export const sesionApi = {
  setToken(t: string | null) {
    token = t
    almacen.guardar('scv.token', t)
  },
  setEmpresa(id: number | null) {
    empresaId = id === null ? null : String(id)
    almacen.guardar('scv.empresa', empresaId)
  },
  get token() {
    return token
  },
  get empresaId() {
    return empresaId ? Number(empresaId) : null
  },
  onExpirar(fn: () => void) {
    alExpirar = fn
  },
}

function cabeceras(extra?: HeadersInit): Headers {
  const h = new Headers(extra)
  h.set('Accept', 'application/json')
  if (token) h.set('Authorization', `Bearer ${token}`)
  if (empresaId) h.set('X-Empresa-Id', empresaId)
  return h
}

async function peticion<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
  const esForm = cuerpo instanceof FormData
  const h = cabeceras(esForm || cuerpo === undefined ? undefined : { 'Content-Type': 'application/json' })
  const r = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: h,
    body: cuerpo === undefined ? undefined : esForm ? cuerpo : JSON.stringify(cuerpo),
  })
  if (r.status === 204) return undefined as T
  const datos = await r.json().catch(() => null)
  if (r.status === 401 && token) alExpirar()
  if (!r.ok) throw new ApiError(r.status, datos)
  return datos as T
}

export const api = {
  get: <T>(ruta: string) => peticion<T>('GET', ruta),
  post: <T>(ruta: string, cuerpo?: unknown) => peticion<T>('POST', ruta, cuerpo ?? {}),
  put: <T>(ruta: string, cuerpo?: unknown) => peticion<T>('PUT', ruta, cuerpo ?? {}),
  delete: <T>(ruta: string) => peticion<T>('DELETE', ruta),
  /** Descarga binaria autenticada (PDF/XML/CDR). */
  async blob(ruta: string): Promise<{ blob: Blob; nombre: string }> {
    const r = await fetch(`${BASE}${ruta}`, { headers: cabeceras() })
    if (!r.ok) throw new ApiError(r.status, await r.json().catch(() => null))
    const disp = r.headers.get('content-disposition') ?? ''
    const nombre = /filename="([^"]+)"/.exec(disp)?.[1] ?? 'documento'
    return { blob: await r.blob(), nombre }
  },
}

/** Mensaje de error legible para toasts. */
export const mensajeError = (e: unknown) =>
  e instanceof ApiError ? (e.errores[0]?.mensaje && e.errores.length === 1 ? e.errores[0].mensaje : e.message) : 'No se pudo completar la operación.'
