import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, Check, ClipboardList, PackageCheck, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { api, mensajeError } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { hoy, type Almacen, type Contacto, type Paginado } from '@/lib/tipos'
import { fecha, soles } from '@/lib/utils'
import { Paginacion } from '@/components/comunes'
import { Boton, Campo, Cargando, Dialogo, Encabezado, Entrada, Insignia, Selector, Tabla, Vacio } from '@/components/ui'
import { FormCompra } from './Compras'
import { LineasCompra, type LineaCompra } from './LineasCompra'

interface Orden {
  id: number
  numero: number
  fecha: string
  moneda: string
  estado: 'borrador' | 'aprobada' | 'recibida' | 'anulada'
  total: number
  proveedor_id: number
  almacen_id: number
  proveedor: Contacto
  items?: Array<{ producto_id: number; descripcion: string; cantidad: number; precio_unitario: number; tip_afe_igv: string }>
}

const COLOR: Record<Orden['estado'], string> = {
  borrador: 'bg-slate-100 text-slate-600 ring-slate-200',
  aprobada: 'bg-sky-50 text-sky-700 ring-sky-200',
  recibida: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  anulada: 'bg-slate-100 text-slate-400 ring-slate-200',
}

export function Ordenes() {
  const { puede } = useSesion()
  const qc = useQueryClient()
  const [pagina, setPagina] = useState(1)
  const [nueva, setNueva] = useState(false)
  const [recibir, setRecibir] = useState<Orden | null>(null)
  const lista = useQuery({ queryKey: ['ordenes', pagina], queryFn: () => api.get<Paginado<Orden>>(`/ordenes-compra?pagina=${pagina}`) })
  const refrescar = () => qc.invalidateQueries({ queryKey: ['ordenes'] })

  const accion = async (o: Orden, a: 'aprobar' | 'anular') => {
    try {
      await api.post(`/ordenes-compra/${o.id}/${a}`)
      toast.success(a === 'aprobar' ? 'Orden aprobada.' : 'Orden anulada.')
      refrescar()
    } catch (e) {
      toast.error(mensajeError(e))
    }
  }
  const abrirRecepcion = async (o: Orden) => {
    const completa = await api.get<Orden>(`/ordenes-compra/${o.id}`)
    setRecibir(completa)
  }

  return (
    <>
      <Encabezado titulo="Órdenes de compra" descripcion="Borrador → aprobada → recibida (al registrar la compra)." acciones={puede('compras.crear') && <Boton onClick={() => setNueva(true)}><Plus className="size-4" /> Nueva orden</Boton>} />
      {lista.isLoading ? <Cargando /> : !lista.data?.data.length ? (
        <Vacio icono={<ClipboardList className="size-8" />} titulo="Sin órdenes de compra" />
      ) : (
        <>
          <Tabla>
            <thead><tr><th>N.º</th><th>Proveedor</th><th className="hidden md:table-cell">Fecha</th><th className="text-right">Total</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {lista.data.data.map((o) => (
                <tr key={o.id}>
                  <td className="font-mono">OC-{String(o.numero).padStart(6, '0')}</td>
                  <td>{o.proveedor.razon_social}</td>
                  <td className="hidden md:table-cell">{fecha(o.fecha)}</td>
                  <td className="text-right tabular-nums">{soles(o.total, o.moneda)}</td>
                  <td><Insignia className={COLOR[o.estado]}>{o.estado}</Insignia></td>
                  <td className="whitespace-nowrap text-right">
                    {o.estado === 'borrador' && puede('compras.aprobar') && <Boton variante="fantasma" tamano="sm" onClick={() => accion(o, 'aprobar')}><Check className="size-3.5" /> Aprobar</Boton>}
                    {o.estado === 'aprobada' && puede('compras.crear') && <Boton variante="fantasma" tamano="sm" onClick={() => abrirRecepcion(o)}><PackageCheck className="size-3.5" /> Recibir</Boton>}
                    {['borrador', 'aprobada'].includes(o.estado) && puede('compras.anular') && <Boton variante="fantasma" tamano="sm" onClick={() => accion(o, 'anular')} aria-label="Anular"><Ban className="size-3.5" /></Boton>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabla>
          <Paginacion meta={lista.data.meta} pagina={pagina} onCambio={setPagina} />
        </>
      )}
      {nueva && <FormOrden onCerrar={() => setNueva(false)} onGuardado={refrescar} />}
      {recibir && (
        <FormCompra
          desdeOrden={{
            id: recibir.id, proveedor_id: recibir.proveedor_id, almacen_id: recibir.almacen_id, moneda: recibir.moneda,
            lineas: (recibir.items ?? []).map((i) => ({ producto_id: i.producto_id, nombre: i.descripcion, cantidad: i.cantidad, precio_unitario: i.precio_unitario, tip_afe_igv: i.tip_afe_igv })),
          }}
          onCerrar={() => setRecibir(null)}
          onGuardado={refrescar}
        />
      )}
    </>
  )
}

function FormOrden({ onCerrar, onGuardado }: { onCerrar: () => void; onGuardado: () => void }) {
  const almacenes = useQuery({ queryKey: ['almacenes'], queryFn: () => api.get<Almacen[]>('/almacenes') })
  const proveedores = useQuery({ queryKey: ['proveedores', 'todos'], queryFn: () => api.get<Paginado<Contacto>>('/proveedores?por_pagina=200&estado=activos') })
  const [proveedorId, setProveedorId] = useState('')
  const [almacenId, setAlmacenId] = useState('')
  const [entrega, setEntrega] = useState('')
  const [lineas, setLineas] = useState<LineaCompra[]>([])
  const [guardando, setGuardando] = useState(false)
  const guardar = async () => {
    setGuardando(true)
    try {
      await api.post('/ordenes-compra', {
        proveedor_id: Number(proveedorId), almacen_id: Number(almacenId || almacenes.data?.[0]?.id), fecha: hoy(), fecha_entrega: entrega || null, moneda: 'PEN',
        items: lineas.map(({ producto_id, cantidad, precio_unitario, tip_afe_igv }) => ({ producto_id, cantidad, precio_unitario, tip_afe_igv })),
      })
      toast.success('Orden creada en borrador.')
      onGuardado()
      onCerrar()
    } catch (e) {
      toast.error(mensajeError(e))
    } finally {
      setGuardando(false)
    }
  }
  return (
    <Dialogo abierto titulo="Nueva orden de compra" onCerrar={onCerrar} ancho="max-w-3xl">
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo etiqueta="Proveedor"><Selector value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}><option value="">Elegir…</option>{proveedores.data?.data.map((p) => <option key={p.id} value={p.id}>{p.razon_social}</option>)}</Selector></Campo>
          <Campo etiqueta="Almacén de destino"><Selector value={almacenId} onChange={(e) => setAlmacenId(e.target.value)}>{almacenes.data?.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Selector></Campo>
          <Campo etiqueta="Entrega estimada"><Entrada type="date" value={entrega} onChange={(e) => setEntrega(e.target.value)} /></Campo>
        </div>
        <LineasCompra lineas={lineas} setLineas={setLineas} />
        <Boton onClick={guardar} cargando={guardando} disabled={!proveedorId || lineas.length === 0} className="self-start">Crear orden</Boton>
      </div>
    </Dialogo>
  )
}
