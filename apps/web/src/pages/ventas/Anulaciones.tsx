import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { api, mensajeError } from '@/lib/api'
import type { Paginado } from '@/lib/tipos'
import { fecha } from '@/lib/utils'
import { Paginacion } from '@/components/comunes'
import { Boton, Cargando, Encabezado, Insignia, Tabla, Vacio } from '@/components/ui'

interface Anulacion {
  id: number
  tipo: 'baja' | 'resumen'
  identificador: string | null
  fecha: string
  motivo: string
  estado: 'enviado' | 'pendiente' | 'aceptado' | 'rechazado'
  sunat_descripcion: string | null
  comprobante_ids: number[]
}

const COLOR: Record<Anulacion['estado'], string> = {
  enviado: 'bg-sky-50 text-sky-700 ring-sky-200',
  pendiente: 'bg-amber-50 text-amber-700 ring-amber-200',
  aceptado: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rechazado: 'bg-rose-50 text-rose-700 ring-rose-200',
}

export function Anulaciones() {
  const qc = useQueryClient()
  const [pagina, setPagina] = useState(1)
  const lista = useQuery({ queryKey: ['anulaciones', pagina], queryFn: () => api.get<Paginado<Anulacion>>(`/anulaciones?pagina=${pagina}`) })
  const consultar = async (a: Anulacion) => {
    try {
      const r = await api.post<Anulacion>(`/anulaciones/${a.id}/consultar`)
      toast.info(`${r.identificador ?? 'Anulación'}: ${r.estado}`)
      qc.invalidateQueries({ queryKey: ['anulaciones'] })
    } catch (e) {
      toast.error(mensajeError(e))
    }
  }
  return (
    <>
      <Encabezado titulo="Anulaciones" descripcion="Comunicaciones de baja (facturas, notas) y resúmenes diarios de anulación (boletas). Se inician desde el detalle del comprobante." />
      {lista.isLoading ? <Cargando /> : !lista.data?.data.length ? (
        <Vacio icono={<Ban className="size-8" />} titulo="Sin anulaciones" />
      ) : (
        <>
          <Tabla>
            <thead><tr><th>Identificador</th><th>Tipo</th><th>Fecha docs.</th><th>Motivo</th><th>Docs.</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {lista.data.data.map((a) => (
                <tr key={a.id}>
                  <td className="font-mono text-xs">{a.identificador ?? `#${a.id}`}</td>
                  <td>{a.tipo === 'baja' ? 'Comunicación de baja' : 'Resumen diario'}</td>
                  <td>{fecha(a.fecha)}</td>
                  <td className="max-w-[16rem] truncate">{a.motivo}</td>
                  <td>{a.comprobante_ids.length}</td>
                  <td><Insignia className={COLOR[a.estado]}>{a.estado}</Insignia>{a.sunat_descripcion && <p className="mt-1 text-xs text-slate-500">{a.sunat_descripcion}</p>}</td>
                  <td className="text-right">{['enviado', 'pendiente'].includes(a.estado) && <Boton variante="fantasma" tamano="sm" onClick={() => consultar(a)}><RefreshCw className="size-3.5" /> Consultar</Boton>}</td>
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
