import type Empresa from '#models/empresa'
import type UsuarioEmpresaRol from '#models/usuario_empresa_rol'

declare module '@adonisjs/core/http' {
  interface HttpContext {
    /** Empresa activa del request (resuelta por empresa_middleware). */
    empresa: Empresa
    membresia: UsuarioEmpresaRol
    permisos: Set<string>
  }
}
