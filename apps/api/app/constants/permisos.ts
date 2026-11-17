/**
 * Catálogo fijo de permisos `modulo.accion`. El seeder lo sincroniza con la tabla `permisos`.
 * Agregar permisos aquí (nunca renombrar uno existente: los roles guardados dependen del código).
 */
export interface DefinicionPermiso {
  codigo: string
  modulo: string
  accion: string
  descripcion: string
}

const def = (modulo: string, accion: string, descripcion: string): DefinicionPermiso => ({
  codigo: `${modulo}.${accion}`,
  modulo,
  accion,
  descripcion,
})

export const PERMISOS: readonly DefinicionPermiso[] = [
  // Compras
  def('compras', 'ver', 'Ver compras y órdenes de compra'),
  def('compras', 'crear', 'Registrar compras y órdenes de compra'),
  def('compras', 'aprobar', 'Aprobar órdenes de compra'),
  def('compras', 'anular', 'Anular compras'),
  def('proveedores', 'gestionar', 'Crear y editar proveedores'),
  def('cxp', 'gestionar', 'Gestionar cuentas por pagar y pagos a proveedores'),
  // Ventas
  def('ventas', 'ver', 'Ver ventas y comprobantes'),
  def('ventas', 'crear', 'Registrar ventas (POS)'),
  def('ventas', 'anular', 'Anular ventas'),
  def('ventas', 'descuento', 'Aplicar descuentos'),
  def('clientes', 'gestionar', 'Crear y editar clientes'),
  def('comprobantes', 'emitir', 'Emitir facturas y boletas'),
  def('comprobantes', 'emitir_nc', 'Emitir notas de crédito'),
  def('comprobantes', 'emitir_nd', 'Emitir notas de débito'),
  def('comprobantes', 'anular', 'Comunicación de baja y resumen de anulación'),
  def('guias', 'emitir', 'Emitir guías de remisión'),
  def('cxc', 'gestionar', 'Gestionar cuentas por cobrar'),
  def('caja', 'operar', 'Aperturar, operar y cerrar caja'),
  // Gestión
  def('inventario', 'ver', 'Ver productos, stock y kardex'),
  def('inventario', 'gestionar', 'Crear productos, ajustes y transferencias'),
  def('reportes', 'ver', 'Ver dashboard y reportes'),
  def('auditoria', 'ver', 'Ver registro de auditoría'),
  // Configuración
  def('config', 'empresa', 'Editar datos de la empresa y credenciales SUNAT'),
  def('config', 'sucursales', 'Gestionar sucursales, almacenes y cajas'),
  def('config', 'series', 'Gestionar series de comprobantes'),
  def('config', 'usuarios', 'Gestionar usuarios de la empresa'),
  def('config', 'roles', 'Gestionar roles y permisos'),
] as const

export const CODIGOS_PERMISO = PERMISOS.map((p) => p.codigo)

/** Plantillas de roles que se crean al dar de alta una empresa. */
export const PLANTILLAS_ROL: Record<string, { descripcion: string; permisos: string[] }> = {
  'Administrador': { descripcion: 'Acceso total a la empresa', permisos: [...CODIGOS_PERMISO] },
  'Vendedor': {
    descripcion: 'Ventas, clientes y emisión de comprobantes',
    permisos: [
      'ventas.ver',
      'ventas.crear',
      'clientes.gestionar',
      'comprobantes.emitir',
      'inventario.ver',
    ],
  },
  'Cajero': {
    descripcion: 'Cobros, caja y emisión',
    permisos: [
      'ventas.ver',
      'ventas.crear',
      'comprobantes.emitir',
      'caja.operar',
      'cxc.gestionar',
      'clientes.gestionar',
    ],
  },
  'Comprador': {
    descripcion: 'Compras y proveedores',
    permisos: [
      'compras.ver',
      'compras.crear',
      'proveedores.gestionar',
      'inventario.ver',
      'cxp.gestionar',
    ],
  },
  'Almacenero': {
    descripcion: 'Inventario y guías',
    permisos: ['inventario.ver', 'inventario.gestionar', 'guias.emitir', 'compras.ver'],
  },
  'Contador': {
    descripcion: 'Consulta, notas y reportes',
    permisos: [
      'ventas.ver',
      'compras.ver',
      'comprobantes.emitir_nc',
      'comprobantes.emitir_nd',
      'comprobantes.anular',
      'reportes.ver',
      'cxc.gestionar',
      'cxp.gestionar',
      'auditoria.ver',
    ],
  },
  'Solo lectura': {
    descripcion: 'Solo consulta',
    permisos: ['ventas.ver', 'compras.ver', 'inventario.ver', 'reportes.ver'],
  },
}

export const ROL_ADMINISTRADOR = 'Administrador'
