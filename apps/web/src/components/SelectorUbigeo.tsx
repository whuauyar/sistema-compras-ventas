import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Campo, Selector } from './ui'

type Opcion = { id: string; nombre: string }

export interface UbigeoElegido {
  ubigeo: string
  departamento: string
  provincia: string
  distrito: string
}

const catalogo = (nivel: string, padre?: string) =>
  api.get<Opcion[]>(`/catalogos/ubigeo/${nivel}${padre ? `?${nivel === 'provincias' ? 'region_id' : 'provincia_id'}=${padre}` : ''}`)

/** Región → provincia → distrito desde el catálogo INEI/SUNAT de la API. Devuelve el ubigeo de 6 dígitos. */
export function SelectorUbigeo({
  valor,
  onCambio,
  deshabilitado = false,
}: {
  valor?: string | null
  onCambio: (u: UbigeoElegido) => void
  deshabilitado?: boolean
}) {
  const [region, setRegion] = useState(valor?.slice(0, 2) ?? '')
  const [provincia, setProvincia] = useState(valor?.slice(0, 4) ?? '')
  const [distrito, setDistrito] = useState(valor ?? '')

  useEffect(() => {
    setRegion(valor?.slice(0, 2) ?? '')
    setProvincia(valor?.slice(0, 4) ?? '')
    setDistrito(valor ?? '')
  }, [valor])

  const regiones = useQuery({ queryKey: ['ubigeo', 'regiones'], queryFn: () => catalogo('regiones'), staleTime: Infinity })
  const provincias = useQuery({ queryKey: ['ubigeo', 'provincias', region], queryFn: () => catalogo('provincias', region), enabled: region.length === 2, staleTime: Infinity })
  const distritos = useQuery({ queryKey: ['ubigeo', 'distritos', provincia], queryFn: () => catalogo('distritos', provincia), enabled: provincia.length === 4, staleTime: Infinity })

  const nombre = (lista: Opcion[] | undefined, id: string) => lista?.find((o) => o.id === id)?.nombre ?? ''

  return (
    <div className="grid gap-3 sm:col-span-2 sm:grid-cols-3">
      <Campo etiqueta="Departamento">
        <Selector disabled={deshabilitado} value={region} onChange={(e) => { setRegion(e.target.value); setProvincia(''); setDistrito('') }}>
          <option value="">Seleccione…</option>
          {regiones.data?.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
        </Selector>
      </Campo>
      <Campo etiqueta="Provincia">
        <Selector disabled={deshabilitado || !region} value={provincia} onChange={(e) => { setProvincia(e.target.value); setDistrito('') }}>
          <option value="">Seleccione…</option>
          {provincias.data?.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
        </Selector>
      </Campo>
      <Campo etiqueta="Distrito" ayuda={distrito ? `Ubigeo ${distrito}` : undefined}>
        <Selector
          disabled={deshabilitado || !provincia}
          value={distrito}
          onChange={(e) => {
            setDistrito(e.target.value)
            if (e.target.value)
              onCambio({
                ubigeo: e.target.value,
                departamento: nombre(regiones.data, region),
                provincia: nombre(provincias.data, provincia),
                distrito: nombre(distritos.data, e.target.value),
              })
          }}
        >
          <option value="">Seleccione…</option>
          {distritos.data?.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
        </Selector>
      </Campo>
    </div>
  )
}
