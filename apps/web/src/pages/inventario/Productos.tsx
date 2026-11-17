import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight, PackagePlus, Pencil, Plus, Search, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { api, mensajeError } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { AFECTACIONES, UNIDADES } from '@/lib/sunat'
import type { Almacen, Paginado, Producto } from '@/lib/tipos'
import { soles } from '@/lib/utils'
import { BuscadorProducto, Paginacion, useDebounce } from '@/components/comunes'
import { Boton, Campo, Cargando, Dialogo, Encabezado, Entrada, Insignia, Selector, Tabla, Vacio } from '@/components/ui'

interface Categoria {
  id: number
  nombre: string
}

export function Productos() {
  const { puede } = useSesion()
  const qc = useQueryClient()
  const [buscar, setBuscar] = useState('')
  const [pagina, setPagina] = useState(1)
  const [almacenId, setAlmacenId] = useState('')
  const [bajoMinimo, setBajoMinimo] = useState(false)
  const [editando, setEditando] = useState<Producto | 'nuevo' | null>(null)
  const [ajuste, setAjuste] = useState(false)
  const [transferencia, setTransferencia] = useState(false)
  const b = useDebounce(buscar)

  const almacenes = useQuery({ queryKey: ['almacenes'], queryFn: () => api.get<Almacen[]>('/almacenes') })
  const params = new URLSearchParams({ pagina: String(pagina), por_pagina: '30' })
  if (b) params.set('buscar', b)
  if (almacenId) params.set('almacen_id', almacenId)
  if (bajoMinimo) params.set('solo_bajo_minimo', 'true')
  const lista = useQuery({ queryKey: ['productos', params.toString()], queryFn: () => api.get<Paginado<Producto>>(`/productos?${params}`) })
  const refrescar = () => qc.invalidateQueries({ queryKey: ['productos'] })
  const gestionar = puede('inventario.gestionar')

  return (
    <>
      <Encabezado
        titulo="Productos e inventario"
        descripcion="Stock y valor al costo promedio (sin IGV)."
        acciones={
          gestionar && (
            <>
              <Boton variante="secundario" onClick={() => setTransferencia(true)}><ArrowLeftRight className="size-4" /> Transferir</Boton>
              <Boton variante="secundario" onClick={() => setAjuste(true)}><PackagePlus className="size-4" /> Ajuste / inventario inicial</Boton>
              <Boton onClick={() => setEditando('nuevo')}><Plus className="size-4" /> Nuevo producto</Boton>
            </>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-slate-400" />
          <Entrada className="pl-8" placeholder="Código, barras o nombre" value={buscar} onChange={(e) => (setBuscar(e.target.value), setPagina(1))} />
        </div>
        <Selector className="w-52" value={almacenId} onChange={(e) => (setAlmacenId(e.target.value), setPagina(1))} aria-label="Almacén">
          <option value="">Todos los almacenes</option>
          {almacenes.data?.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </Selector>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" className="size-4 accent-acento-600" checked={bajoMinimo} onChange={(e) => (setBajoMinimo(e.target.checked), setPagina(1))} /> Solo bajo mínimo
        </label>
      </div>

      {lista.isLoading ? <Cargando /> : !lista.data?.data.length ? (
        <Vacio icono={<PackagePlus className="size-8" />} titulo="Sin productos" texto="Cree productos y cargue su inventario inicial con un ajuste." />
      ) : (
        <>
          <Tabla>
            <thead><tr><th>Código</th><th>Producto</th><th className="hidden md:table-cell">Categoría</th><th className="text-right">Precio</th><th className="text-right">Stock</th><th className="hidden text-right md:table-cell">Valor</th><th /></tr></thead>
            <tbody>
              {lista.data.data.map((p) => {
                const bajo = p.controla_stock && (p.stock ?? 0) <= p.stock_minimo
                return (
                  <tr key={p.id} className={p.activo ? '' : 'opacity-50'}>
                    <td className="font-mono text-xs">{p.codigo}</td>
                    <td><p className="font-medium">{p.nombre}</p><p className="text-xs text-slate-500">{UNIDADES.find((u) => u.valor === p.unidad)?.etiqueta ?? p.unidad} · {AFECTACIONES.find((a) => a.valor === p.tip_afe_igv)?.etiqueta}</p></td>
                    <td className="hidden md:table-cell">{p.categoria ?? '—'}</td>
                    <td className="text-right tabular-nums">{soles(p.precio_venta)}</td>
                    <td className="text-right tabular-nums">
                      {p.controla_stock ? (
                        <span className={bajo ? 'inline-flex items-center gap-1 font-medium text-amber-700' : ''}>{bajo && <TriangleAlert className="size-3.5" />}{p.stock}</span>
                      ) : <Insignia className="bg-slate-100 text-slate-500 ring-slate-200">Servicio</Insignia>}
                    </td>
                    <td className="hidden text-right tabular-nums md:table-cell">{p.controla_stock ? soles(p.valor_stock ?? 0) : '—'}</td>
                    <td className="text-right">{gestionar && <Boton variante="fantasma" tamano="sm" onClick={() => setEditando(p)} aria-label="Editar"><Pencil className="size-3.5" /></Boton>}</td>
                  </tr>
                )
              })}
            </tbody>
          </Tabla>
          <Paginacion meta={lista.data.meta} pagina={pagina} onCambio={setPagina} />
        </>
      )}
      {editando && <FormProducto producto={editando === 'nuevo' ? null : editando} onCerrar={() => setEditando(null)} onGuardado={refrescar} />}
      {ajuste && <FormAjuste almacenes={almacenes.data ?? []} onCerrar={() => setAjuste(false)} onGuardado={refrescar} />}
      {transferencia && <FormTransferencia almacenes={almacenes.data ?? []} onCerrar={() => setTransferencia(false)} onGuardado={refrescar} />}
    </>
  )
}

type DatosProducto = Omit<Producto, 'id' | 'categoria' | 'stock' | 'valor_stock' | 'categoria_id'> & { categoria_id: string }

function FormProducto({ producto, onCerrar, onGuardado }: { producto: Producto | null; onCerrar: () => void; onGuardado: () => void }) {
  const qc = useQueryClient()
  const categorias = useQuery({ queryKey: ['categorias'], queryFn: () => api.get<Categoria[]>('/categorias') })
  const [nuevaCategoria, setNuevaCategoria] = useState('')
  const { register, handleSubmit, watch, setValue, formState } = useForm<DatosProducto>({
    defaultValues: producto
      ? { ...producto, categoria_id: producto.categoria_id ? String(producto.categoria_id) : '', codigo_barras: producto.codigo_barras ?? '' }
      : { codigo: '', nombre: '', unidad: 'NIU', tip_afe_igv: '10', controla_stock: true, precio_venta: 0, stock_minimo: 0, activo: true, categoria_id: '', codigo_barras: '' },
  })
  const unidad = watch('unidad')
  useEffect(() => {
    if (unidad === 'ZZ') setValue('controla_stock', false)
  }, [unidad, setValue])

  const crearCategoria = async () => {
    if (!nuevaCategoria.trim()) return
    try {
      const c = await api.post<Categoria>('/categorias', { nombre: nuevaCategoria.trim() })
      await qc.invalidateQueries({ queryKey: ['categorias'] })
      setValue('categoria_id', String(c.id))
      setNuevaCategoria('')
    } catch (e) {
      toast.error(mensajeError(e))
    }
  }

  const guardar = handleSubmit(async (d) => {
    const cuerpo = {
      ...d,
      categoria_id: d.categoria_id ? Number(d.categoria_id) : null,
      codigo_barras: d.codigo_barras || null,
      precio_venta: Number(d.precio_venta),
      stock_minimo: Number(d.stock_minimo),
    }
    try {
      if (producto) await api.put(`/productos/${producto.id}`, cuerpo)
      else await api.post('/productos', cuerpo)
      toast.success('Producto guardado.')
      onGuardado()
      onCerrar()
    } catch (e) {
      toast.error(mensajeError(e))
    }
  })

  return (
    <Dialogo abierto titulo={producto ? 'Editar producto' : 'Nuevo producto'} onCerrar={onCerrar} ancho="max-w-2xl">
      <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Código"><Entrada className="uppercase" {...register('codigo', { required: true })} /></Campo>
        <Campo etiqueta="Código de barras"><Entrada {...register('codigo_barras')} /></Campo>
        <Campo etiqueta="Nombre" className="sm:col-span-2"><Entrada {...register('nombre', { required: true })} /></Campo>
        <Campo etiqueta="Categoría">
          <Selector {...register('categoria_id')}>
            <option value="">Sin categoría</option>
            {categorias.data?.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Selector>
        </Campo>
        <Campo etiqueta="Nueva categoría">
          <div className="flex gap-1.5">
            <Entrada value={nuevaCategoria} onChange={(e) => setNuevaCategoria(e.target.value)} placeholder="Ej. Abarrotes" />
            <Boton type="button" variante="secundario" onClick={crearCategoria}>Crear</Boton>
          </div>
        </Campo>
        <Campo etiqueta="Unidad"><Selector {...register('unidad')}>{UNIDADES.map((u) => <option key={u.valor} value={u.valor}>{u.etiqueta}</option>)}</Selector></Campo>
        <Campo etiqueta="IGV"><Selector {...register('tip_afe_igv')}>{AFECTACIONES.map((a) => <option key={a.valor} value={a.valor}>{a.etiqueta}</option>)}</Selector></Campo>
        <Campo etiqueta="Precio de venta (con IGV)"><Entrada type="number" step="0.01" min="0" {...register('precio_venta', { valueAsNumber: true })} /></Campo>
        <Campo etiqueta="Stock mínimo"><Entrada type="number" step="any" min="0" {...register('stock_minimo', { valueAsNumber: true })} /></Campo>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-acento-600" disabled={unidad === 'ZZ'} {...register('controla_stock')} /> Controla stock (kardex)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-acento-600" {...register('activo')} /> Activo</label>
        <Boton type="submit" cargando={formState.isSubmitting} className="sm:col-span-2 sm:justify-self-start">Guardar</Boton>
      </form>
    </Dialogo>
  )
}

interface LineaInventario {
  producto: Producto
  cantidad: number
  costo: number
}

function LineasProductos({ lineas, setLineas, conCosto }: { lineas: LineaInventario[]; setLineas: (l: LineaInventario[]) => void; conCosto: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <BuscadorProducto onElegir={(p) => !lineas.some((l) => l.producto.id === p.id) && setLineas([...lineas, { producto: p, cantidad: 1, costo: 0 }])} />
      {lineas.map((l, i) => (
        <div key={l.producto.id} className="grid grid-cols-[1fr_6rem_7rem_auto] items-center gap-2 text-sm">
          <span className="truncate">{l.producto.nombre}</span>
          <Entrada type="number" min="0" step="any" value={l.cantidad} onChange={(e) => setLineas(lineas.map((x, j) => (j === i ? { ...x, cantidad: Number(e.target.value) } : x)))} aria-label="Cantidad" />
          {conCosto ? (
            <Entrada type="number" min="0" step="0.0001" placeholder="Costo s/IGV" value={l.costo || ''} onChange={(e) => setLineas(lineas.map((x, j) => (j === i ? { ...x, costo: Number(e.target.value) } : x)))} aria-label="Costo unitario" />
          ) : <span />}
          <Boton type="button" variante="fantasma" tamano="sm" onClick={() => setLineas(lineas.filter((_, j) => j !== i))}>Quitar</Boton>
        </div>
      ))}
    </div>
  )
}

function FormAjuste({ almacenes, onCerrar, onGuardado }: { almacenes: Almacen[]; onCerrar: () => void; onGuardado: () => void }) {
  const [almacenId, setAlmacenId] = useState(String(almacenes[0]?.id ?? ''))
  const [tipo, setTipo] = useState<'entrada' | 'salida'>('entrada')
  const [motivo, setMotivo] = useState('inventario_inicial')
  const [observacion, setObservacion] = useState('')
  const [lineas, setLineas] = useState<LineaInventario[]>([])
  const [guardando, setGuardando] = useState(false)

  const guardar = async () => {
    setGuardando(true)
    try {
      await api.post('/inventario/ajustes', {
        almacen_id: Number(almacenId), tipo, motivo, observacion: observacion || null,
        items: lineas.map((l) => ({ producto_id: l.producto.id, cantidad: l.cantidad, costo_unitario: tipo === 'entrada' ? l.costo : undefined })),
      })
      toast.success('Ajuste registrado en el kardex.')
      onGuardado()
      onCerrar()
    } catch (e) {
      toast.error(mensajeError(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialogo abierto titulo="Ajuste de inventario" onCerrar={onCerrar} ancho="max-w-2xl">
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo etiqueta="Almacén"><Selector value={almacenId} onChange={(e) => setAlmacenId(e.target.value)}>{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Selector></Campo>
          <Campo etiqueta="Tipo">
            <Selector value={tipo} onChange={(e) => { const t = e.target.value as 'entrada' | 'salida'; setTipo(t); setMotivo(t === 'entrada' ? 'inventario_inicial' : 'merma') }}>
              <option value="entrada">Entrada</option><option value="salida">Salida</option>
            </Selector>
          </Campo>
          <Campo etiqueta="Motivo">
            <Selector value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              {tipo === 'entrada' && <option value="inventario_inicial">Inventario inicial</option>}
              {tipo === 'salida' && <option value="merma">Merma / pérdida</option>}
              <option value="ajuste">Ajuste por conteo</option>
              <option value="otro">Otro</option>
            </Selector>
          </Campo>
        </div>
        <LineasProductos lineas={lineas} setLineas={setLineas} conCosto={tipo === 'entrada'} />
        <Campo etiqueta="Observación"><Entrada value={observacion} onChange={(e) => setObservacion(e.target.value)} /></Campo>
        <Boton onClick={guardar} cargando={guardando} disabled={lineas.length === 0} className="self-start">Registrar ajuste</Boton>
      </div>
    </Dialogo>
  )
}

function FormTransferencia({ almacenes, onCerrar, onGuardado }: { almacenes: Almacen[]; onCerrar: () => void; onGuardado: () => void }) {
  const [origen, setOrigen] = useState(String(almacenes[0]?.id ?? ''))
  const [destino, setDestino] = useState(String(almacenes[1]?.id ?? ''))
  const [lineas, setLineas] = useState<LineaInventario[]>([])
  const [guardando, setGuardando] = useState(false)
  const guardar = async () => {
    setGuardando(true)
    try {
      await api.post('/inventario/transferencias', {
        almacen_origen_id: Number(origen), almacen_destino_id: Number(destino),
        items: lineas.map((l) => ({ producto_id: l.producto.id, cantidad: l.cantidad })),
      })
      toast.success('Transferencia registrada.')
      onGuardado()
      onCerrar()
    } catch (e) {
      toast.error(mensajeError(e))
    } finally {
      setGuardando(false)
    }
  }
  if (almacenes.length < 2) {
    return <Dialogo abierto titulo="Transferencia" onCerrar={onCerrar}><p className="text-sm text-slate-600">Necesita al menos dos almacenes. Cree otra sucursal en Configuración.</p></Dialogo>
  }
  return (
    <Dialogo abierto titulo="Transferencia entre almacenes" onCerrar={onCerrar} ancho="max-w-2xl">
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Desde"><Selector value={origen} onChange={(e) => setOrigen(e.target.value)}>{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Selector></Campo>
          <Campo etiqueta="Hacia"><Selector value={destino} onChange={(e) => setDestino(e.target.value)}>{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Selector></Campo>
        </div>
        <LineasProductos lineas={lineas} setLineas={setLineas} conCosto={false} />
        <Boton onClick={guardar} cargando={guardando} disabled={lineas.length === 0 || origen === destino} className="self-start">Transferir</Boton>
      </div>
    </Dialogo>
  )
}
