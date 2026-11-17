import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSesion } from '@/lib/sesion'
import { Layout } from '@/components/Layout'
import { Cargando, Vacio } from '@/components/ui'
import { Login, Registro } from '@/pages/Acceso'
import { NuevaEmpresa } from '@/pages/NuevaEmpresa'
import { Comprobantes } from '@/pages/Comprobantes'
import { EmitirComprobante } from '@/pages/EmitirComprobante'
import { Perfil } from '@/pages/Perfil'
import { Pendiente } from '@/pages/Pendiente'
import { ConfigEmpresa } from '@/pages/config/Empresa'
import { Sucursales } from '@/pages/config/Sucursales'
import { Series } from '@/pages/config/Series'
import { Usuarios } from '@/pages/config/Usuarios'
import { Roles } from '@/pages/config/Roles'
import { ShieldOff } from 'lucide-react'

function Protegida({ children }: { children: ReactNode }) {
  const { cargando, usuario, empresas } = useSesion()
  if (cargando) return <Cargando texto="Iniciando sesión…" />
  if (!usuario) return <Navigate to="/login" replace />
  if (empresas.length === 0) return <Navigate to="/empresas/nueva" replace />
  return <>{children}</>
}

function ConPermiso({ permiso, children }: { permiso: string; children: ReactNode }) {
  const { puede } = useSesion()
  return puede(permiso) ? <>{children}</> : <Vacio icono={<ShieldOff className="size-8" />} titulo="Sin acceso" texto="Su rol no tiene permiso para esta sección." />
}

function SoloAutenticado({ children }: { children: ReactNode }) {
  const { cargando, usuario } = useSesion()
  if (cargando) return <Cargando />
  return usuario ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  const { usuario } = useSesion()
  return (
    <Routes>
      <Route path="/login" element={usuario ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/registro" element={usuario ? <Navigate to="/" replace /> : <Registro />} />
      <Route path="/empresas/nueva" element={<SoloAutenticado><NuevaEmpresa /></SoloAutenticado>} />
      <Route element={<Protegida><Layout /></Protegida>}>
        <Route index element={<Navigate to="/ventas/comprobantes" replace />} />
        <Route path="ventas/comprobantes" element={<ConPermiso permiso="ventas.ver"><Comprobantes /></ConPermiso>} />
        <Route path="ventas/emitir" element={<ConPermiso permiso="comprobantes.emitir"><EmitirComprobante /></ConPermiso>} />
        <Route path="compras" element={<Pendiente titulo="Compras" fase="fase 3" />} />
        <Route path="inventario" element={<Pendiente titulo="Inventario" fase="fase 3" />} />
        <Route path="gestion" element={<Pendiente titulo="Dashboard y reportes" fase="fase 6" />} />
        <Route path="config/empresa" element={<ConfigEmpresa />} />
        <Route path="config/sucursales" element={<Sucursales />} />
        <Route path="config/series" element={<Series />} />
        <Route path="config/usuarios" element={<ConPermiso permiso="config.usuarios"><Usuarios /></ConPermiso>} />
        <Route path="config/roles" element={<ConPermiso permiso="config.roles"><Roles /></ConPermiso>} />
        <Route path="perfil" element={<Perfil />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
