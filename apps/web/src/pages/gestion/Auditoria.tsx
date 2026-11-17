import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { api } from '@/lib/api'
import type { Paginado } from '@/lib/tipos'
import { Paginacion } from '@/components/comunes'
import { Cargando, Encabezado, Tabla, Vacio } from '@/components/ui'

interface Evento {
  id: number
  usuario_id: number | null
  accion: string
  entidad: string
  entidad_id: string | null
  ip: string | null
  created_at: string
}

export function Auditoria() {
  const [pagina, setPagina] = useState(1)
  const lista = useQuery({ queryKey: ['auditoria', pagina], queryFn: () => api.get<Paginado<Evento>>(`/auditoria?pagina=${pagina}`) })
  return (
    <>
      <Encabezado titulo="Auditoría" descripcion="Quién hizo qué y cuándo en esta empresa." />
      {lista.isLoading ? <Cargando /> : !lista.data?.data.length ? <Vacio icono={<History className="size-8" />} titulo="Sin eventos" /> : (
        <>
          <Tabla>
            <thead><tr><th>Fecha</th><th>Acción</th><th>Entidad</th><th>Usuario</th><th>IP</th></tr></thead>
            <tbody>
              {lista.data.data.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap text-xs">{new Date(e.created_at).toLocaleString('es-PE')}</td>
                  <td className="font-mono text-xs">{e.accion}</td>
                  <td>{e.entidad} {e.entidad_id && `#${e.entidad_id}`}</td>
                  <td>{e.usuario_id ?? '—'}</td>
                  <td className="text-xs text-slate-500">{e.ip}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
          <Paginacion meta={lista.data.meta} pagina={pagina} onCambio={setPagina} />
        </>
      )}
    </>
  )
}
