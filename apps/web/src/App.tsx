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
import { ConfigEmpresa } from '@/pages/config/Empresa'
import { Sucursales } from '@/pages/config/Sucursales'
import { Series } from '@/pages/config/Series'
import { Usuarios } from '@/pages/config/Usuarios'
import { Roles } from '@/pages/config/Roles'
import { ShieldOff } from 'lucide-react'
import { Productos } from '@/pages/inventario/Productos'
import { Kardex } from '@/pages/inventario/Kardex'
import { Contactos } from '@/pages/Contactos'
import { Compras } from '@/pages/compras/Compras'
import { Ordenes } from '@/pages/compras/Ordenes'
import { Cuentas } from '@/pages/Cuentas'
import { Pos } from '@/pages/ventas/Pos'
import { Ventas } from '@/pages/ventas/Ventas'
import { Caja } from '@/pages/ventas/Caja'
import { ComprobanteDetalle } from '@/pages/ventas/ComprobanteDetalle'
import { Guias } from '@/pages/ventas/Guias'
import { Anulaciones } from '@/pages/ventas/Anulaciones'
import { Dashboard } from '@/pages/gestion/Dashboard'
import { Reportes } from '@/pages/gestion/Reportes'
import { Auditoria } from '@/pages/gestion/Auditoria'

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

/** Página de inicio según el rol: dashboard, POS o comprobantes. */
function Inicio() {
  const { puede } = useSesion()
  if (puede('reportes.ver')) return <Navigate to="/gestion" replace />
  if (puede('ventas.crear')) return <Navigate to="/ventas/pos" replace />
  if (puede('compras.ver')) return <Navigate to="/compras" replace />
  return <Navigate to="/ventas/comprobantes" replace />
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
        <Route index element={<Inicio />} />
        <Route path="ventas/pos" element={<ConPermiso permiso="ventas.crear"><Pos /></ConPermiso>} />
        <Route path="ventas" element={<ConPermiso permiso="ventas.ver"><Ventas /></ConPermiso>} />
        <Route path="ventas/comprobantes/:id" element={<ConPermiso permiso="ventas.ver"><ComprobanteDetalle /></ConPermiso>} />
        <Route path="ventas/guias" element={<ConPermiso permiso="guias.emitir"><Guias /></ConPermiso>} />
        <Route path="ventas/anulaciones" element={<ConPermiso permiso="comprobantes.anular"><Anulaciones /></ConPermiso>} />
        <Route path="ventas/cuentas-por-cobrar" element={<ConPermiso permiso="cxc.gestionar"><Cuentas tipo="cobrar" /></ConPermiso>} />
        <Route path="ventas/caja" element={<ConPermiso permiso="caja.operar"><Caja /></ConPermiso>} />
        <Route path="ventas/clientes" element={<ConPermiso permiso="clientes.gestionar"><Contactos tipo="clientes" /></ConPermiso>} />
        <Route path="compras" element={<ConPermiso permiso="compras.ver"><Compras /></ConPermiso>} />
        <Route path="compras/ordenes" element={<ConPermiso permiso="compras.ver"><Ordenes /></ConPermiso>} />
        <Route path="compras/proveedores" element={<ConPermiso permiso="proveedores.gestionar|compras.ver"><Contactos tipo="proveedores" /></ConPermiso>} />
        <Route path="compras/cuentas-por-pagar" element={<ConPermiso permiso="cxp.gestionar"><Cuentas tipo="pagar" /></ConPermiso>} />
        <Route path="inventario" element={<ConPermiso permiso="inventario.ver"><Productos /></ConPermiso>} />
        <Route path="inventario/kardex" element={<ConPermiso permiso="inventario.ver"><Kardex /></ConPermiso>} />
        <Route path="gestion" element={<ConPermiso permiso="reportes.ver"><Dashboard /></ConPermiso>} />
        <Route path="gestion/reportes" element={<ConPermiso permiso="reportes.ver"><Reportes /></ConPermiso>} />
        <Route path="gestion/auditoria" element={<ConPermiso permiso="auditoria.ver"><Auditoria /></ConPermiso>} />
        <Route path="ventas/comprobantes" element={<ConPermiso permiso="ventas.ver"><Comprobantes /></ConPermiso>} />
        <Route path="ventas/emitir" element={<ConPermiso permiso="comprobantes.emitir"><EmitirComprobante /></ConPermiso>} />
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
