import { NOMBRE_MODULO } from '@/lib/permisos'

export type Catalogo = Record<string, Array<{ codigo: string; accion: string; descripcion: string }>>

/** Matriz módulo × permiso con casillas; marcar el módulo marca todas sus acciones. */
export function MatrizPermisos({
  catalogo,
  marcados,
  onCambio,
  bloqueado = false,
}: {
  catalogo: Catalogo
  marcados: Set<string>
  onCambio: (marcados: Set<string>) => void
  bloqueado?: boolean
}) {
  const alternar = (codigos: string[], activar: boolean) => {
    const s = new Set(marcados)
    codigos.forEach((c) => (activar ? s.add(c) : s.delete(c)))
    onCambio(s)
  }
  return (
    <div className="divide-y divide-slate-100">
      {Object.entries(catalogo).map(([modulo, permisos]) => {
        const codigos = permisos.map((p) => p.codigo)
        return (
          <div key={modulo} className="grid gap-2 px-5 py-3 sm:grid-cols-[12rem_1fr]">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="size-4 accent-acento-600"
                disabled={bloqueado}
                checked={codigos.every((c) => marcados.has(c))}
                onChange={(e) => alternar(codigos, e.target.checked)}
              />
              {NOMBRE_MODULO[modulo] ?? modulo}
            </label>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5">
              {permisos.map((p) => (
                <label key={p.codigo} className="flex items-center gap-1.5 text-sm text-slate-600" title={p.codigo}>
                  <input
                    type="checkbox"
                    className="size-4 accent-acento-600"
                    disabled={bloqueado}
                    checked={marcados.has(p.codigo)}
                    onChange={(e) => alternar([p.codigo], e.target.checked)}
                  />
                  {p.descripcion}
                </label>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
