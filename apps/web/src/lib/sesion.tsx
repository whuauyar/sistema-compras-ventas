import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, sesionApi } from './api'

export interface EmpresaSesion {
  id: number
  ruc: string
  razon_social: string
  nombre_comercial: string | null
  entorno: 'beta' | 'production'
  rol: { id: number; nombre: string }
  permisos: string[]
}

export interface UsuarioSesion {
  id: number
  nombre_completo: string
  email: string
  telefono: string | null
  formato_impresion: string | null
  empresa_predeterminada_id: number | null
}

interface RespuestaSesion {
  token?: string
  usuario: UsuarioSesion
  empresas: EmpresaSesion[]
}

interface ValorSesion {
  cargando: boolean
  usuario: UsuarioSesion | null
  empresas: EmpresaSesion[]
  empresa: EmpresaSesion | null
  puede: (permiso: string) => boolean
  ingresar: (email: string, password: string) => Promise<void>
  registrarse: (datos: { nombre_completo: string; email: string; password: string }) => Promise<void>
  salir: () => Promise<void>
  cambiarEmpresa: (id: number) => void
  recargar: () => Promise<void>
}

const Contexto = createContext<ValorSesion | null>(null)

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [cargando, setCargando] = useState(Boolean(sesionApi.token))
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null)
  const [empresas, setEmpresas] = useState<EmpresaSesion[]>([])
  const [empresaId, setEmpresaId] = useState<number | null>(sesionApi.empresaId)

  const aplicar = useCallback((r: RespuestaSesion) => {
    if (r.token) sesionApi.setToken(r.token)
    setUsuario(r.usuario)
    setEmpresas(r.empresas)
    // Empresa activa: la guardada si sigue siendo válida, si no la predeterminada o la primera
    const guardada = sesionApi.empresaId
    const elegida =
      r.empresas.find((e) => e.id === guardada) ??
      r.empresas.find((e) => e.id === r.usuario.empresa_predeterminada_id) ??
      r.empresas[0] ??
      null
    sesionApi.setEmpresa(elegida?.id ?? null)
    setEmpresaId(elegida?.id ?? null)
  }, [])

  const limpiar = useCallback(() => {
    sesionApi.setToken(null)
    sesionApi.setEmpresa(null)
    setUsuario(null)
    setEmpresas([])
    setEmpresaId(null)
    qc.clear()
  }, [qc])

  const recargar = useCallback(async () => {
    aplicar(await api.get<RespuestaSesion>('/auth/yo'))
  }, [aplicar])

  useEffect(() => {
    sesionApi.onExpirar(limpiar)
    if (!sesionApi.token) return
    recargar()
      .catch(limpiar)
      .finally(() => setCargando(false))
  }, [limpiar, recargar])

  const valor = useMemo<ValorSesion>(() => {
    const empresa = empresas.find((e) => e.id === empresaId) ?? null
    return {
      cargando,
      usuario,
      empresas,
      empresa,
      puede: (p) => Boolean(empresa?.permisos.includes(p)),
      ingresar: async (email, password) => aplicar(await api.post<RespuestaSesion>('/auth/login', { email, password })),
      registrarse: async (datos) => aplicar(await api.post<RespuestaSesion>('/auth/registro', datos)),
      salir: async () => {
        await api.post('/auth/logout').catch(() => undefined)
        limpiar()
      },
      cambiarEmpresa: (id) => {
        sesionApi.setEmpresa(id)
        setEmpresaId(id)
        qc.clear() // los datos en caché son de otra empresa
      },
      recargar,
    }
  }, [aplicar, cargando, empresaId, empresas, limpiar, qc, recargar, usuario])

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useSesion() {
  const v = useContext(Contexto)
  if (!v) throw new Error('useSesion debe usarse dentro de ProveedorSesion')
  return v
}
