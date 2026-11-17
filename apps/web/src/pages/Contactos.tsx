import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Search, Users } from 'lucide-react'
import { toast } from 'sonner'
import { api, mensajeError } from '@/lib/api'
import { TIPOS_DOC_IDENTIDAD } from '@/lib/sunat'
import type { Contacto, Paginado } from '@/lib/tipos'
import { Paginacion, useDebounce } from '@/components/comunes'
import { Boton, Campo, Cargando, Dialogo, Encabezado, Entrada, Selector, Tabla, Vacio } from '@/components/ui'

/** Pantalla común para clientes y proveedores. */
export function Contactos({ tipo }: { tipo: 'clientes' | 'proveedores' }) {
  const qc = useQueryClient()
  const [buscar, setBuscar] = useState('')
  const [pagina, setPagina] = useState(1)
  const [editando, setEditando] = useState<Contacto | 'nuevo' | null>(null)
  const b = useDebounce(buscar)
  const lista = useQuery({
    queryKey: [tipo, b, pagina],
    queryFn: () => api.get<Paginado<Contacto>>(`/${tipo}?pagina=${pagina}&buscar=${encodeURIComponent(b)}`),
  })
  const singular = tipo === 'clientes' ? 'cliente' : 'proveedor'
  return (
    <>
      <Encabezado titulo={tipo === 'clientes' ? 'Clientes' : 'Proveedores'} acciones={<Boton onClick={() => setEditando('nuevo')}><Plus className="size-4" /> Nuevo {singular}</Boton>} />
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-slate-400" />
        <Entrada className="pl-8" placeholder="Nombre o documento" value={buscar} onChange={(e) => (setBuscar(e.target.value), setPagina(1))} />
      </div>
      {lista.isLoading ? <Cargando /> : !lista.data?.data.length ? (
        <Vacio icono={<Users className="size-8" />} titulo={`Sin ${tipo}`} />
      ) : (
        <>
          <Tabla>
            <thead><tr><th>Documento</th><th>Razón social / nombre</th><th className="hidden md:table-cell">Contacto</th><th /></tr></thead>
            <tbody>
              {lista.data.data.map((c) => (
                <tr key={c.id} className={c.activo ? '' : 'opacity-50'}>
                  <td className="whitespace-nowrap">{TIPOS_DOC_IDENTIDAD.find((t) => t.valor === c.tipo_doc)?.etiqueta} {c.num_doc}</td>
                  <td><p className="font-medium">{c.razon_social}</p>{c.direccion && <p className="text-xs text-slate-500">{c.direccion}</p>}</td>
                  <td className="hidden text-sm md:table-cell">{[c.telefono, c.email].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="text-right"><Boton variante="fantasma" tamano="sm" onClick={() => setEditando(c)} aria-label="Editar"><Pencil className="size-3.5" /></Boton></td>
                </tr>
              ))}
            </tbody>
          </Tabla>
          <Paginacion meta={lista.data.meta} pagina={pagina} onCambio={setPagina} />
        </>
      )}
      {editando && (
        <FormContacto tipo={tipo} contacto={editando === 'nuevo' ? null : editando} onCerrar={() => setEditando(null)} onGuardado={() => qc.invalidateQueries({ queryKey: [tipo] })} />
      )}
    </>
  )
}

export function FormContacto({ tipo, contacto, onCerrar, onGuardado }: { tipo: 'clientes' | 'proveedores'; contacto: Contacto | null; onCerrar: () => void; onGuardado: (c: Contacto) => void }) {
  const { register, handleSubmit, getValues, setValue, formState } = useForm<Contacto>({
    defaultValues: contacto ?? { tipo_doc: tipo === 'proveedores' ? '6' : '1', num_doc: '', razon_social: '', direccion: '', email: '', telefono: '', activo: true },
  })
  const [buscando, setBuscando] = useState(false)
  const consultar = async () => {
    const { tipo_doc, num_doc } = getValues()
    if (!['1', '6'].includes(tipo_doc)) return
    setBuscando(true)
    try {
      const d = await api.get<{ razon_social?: string; nombre?: string; direccion?: string }>(`/consultas/documento?tipo=${tipo_doc}&numero=${num_doc}`)
      setValue('razon_social', d.razon_social ?? d.nombre ?? '')
      if (d.direccion) setValue('direccion', d.direccion)
    } catch (e) {
      toast.error(mensajeError(e))
    } finally {
      setBuscando(false)
    }
  }
  const guardar = handleSubmit(async (d) => {
    const cuerpo = { ...d, direccion: d.direccion || null, email: d.email || null, telefono: d.telefono || null, ubigeo: d.ubigeo || null, nombre_comercial: d.nombre_comercial || null }
    try {
      const r = contacto ? await api.put<Contacto>(`/${tipo}/${contacto.id}`, cuerpo) : await api.post<Contacto>(`/${tipo}`, cuerpo)
      toast.success('Guardado.')
      onGuardado(r)
      onCerrar()
    } catch (e) {
      toast.error(mensajeError(e))
    }
  })
  return (
    <Dialogo abierto titulo={contacto ? 'Editar' : tipo === 'clientes' ? 'Nuevo cliente' : 'Nuevo proveedor'} onCerrar={onCerrar}>
      <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Documento"><Selector {...register('tipo_doc')}>{TIPOS_DOC_IDENTIDAD.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}</Selector></Campo>
        <Campo etiqueta="Número">
          <div className="flex gap-1.5"><Entrada {...register('num_doc', { required: true })} /><Boton type="button" variante="secundario" cargando={buscando} onClick={consultar} title="Consultar SUNAT/RENIEC"><Search className="size-4" /></Boton></div>
        </Campo>
        <Campo etiqueta="Razón social / nombre" className="sm:col-span-2"><Entrada {...register('razon_social', { required: true })} /></Campo>
        <Campo etiqueta="Dirección" className="sm:col-span-2"><Entrada {...register('direccion')} /></Campo>
        <Campo etiqueta="Teléfono"><Entrada {...register('telefono')} /></Campo>
        <Campo etiqueta="Correo"><Entrada type="email" {...register('email')} /></Campo>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-acento-600" {...register('activo')} /> Activo</label>
        <Boton type="submit" cargando={formState.isSubmitting} className="sm:col-span-2 sm:justify-self-start">Guardar</Boton>
      </form>
    </Dialogo>
  )
}
