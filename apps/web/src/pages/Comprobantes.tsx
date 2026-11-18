import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDownUp, Ban, Copy, Download, Eye, FilePlus2, FileText, MoreHorizontal, RefreshCw, Search, Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { api, mensajeError } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { descargarArchivo } from '@/lib/descargas'
import { abrirPdf } from '@/lib/pdf'
import { ESTADOS, TIPOS_DOCUMENTO, type EstadoSunat } from '@/lib/sunat'
import { cn, fecha, soles } from '@/lib/utils'
import { EstadoSunatBadge } from '@/components/EstadoSunat'
import { FormAnular } from '@/components/FormAnular'
import { Boton, Cargando, Dialogo, Encabezado, Entrada, Insignia, Selector, Vacio } from '@/components/ui'

export interface ComprobanteFila {
  id: number
  tipo_documento: string
  serie: string
  numero_completo: string | null
  fecha_emision: string
  moneda: string
  cliente_num_doc: string
  cliente_razon_social: string
  total: number
  sunat_api_id: number | null
  sunat_estado: EstadoSunat
  sunat_codigo: string | null
  sunat_descripcion: string | null
  sunat_notas: unknown
  sunat_enviado_en?: string | null
}

interface Resumen {
  total: number
  facturas: number
  boletas: number
  notas_credito: number
  notas_debito: number
  guias: number
  aceptados: number
  rechazados: number
  monto_total: number
}

interface Pagina {
  meta: { total: number; currentPage?: number; lastPage?: number; current_page?: number; last_page?: number }
  data: ComprobanteFila[]
  resumen: Resumen
}

interface Filtros {
  buscar: string
  tipo: string
  estado: string
  moneda: string
  sucursal: string
  serie: string
  desde: string
  hasta: string
}

const VACIOS: Filtros = { buscar: '', tipo: '', estado: '', moneda: '', sucursal: '', serie: '', desde: '', hasta: '' }
const EN_PROCESO: EstadoSunat[] = ['pendiente', 'enviado', 'error_envio', 'anulacion_en_proceso']
const CON_CDR: EstadoSunat[] = ['aceptado', 'rechazado', 'anulacion_en_proceso', 'anulado']
const ANULABLES = ['01', '03', '07', '08']

/** Insignia de tipo de comprobante. */
const ETIQUETA_TIPO: Record<string, string> = {
  '01': 'Factura', '03': 'Boleta', '07': 'N. Crédito', '08': 'N. Débito', '09': 'Guía', '31': 'Guía transp.',
}

/** Bandeja de comprobantes de la empresa: indicadores, filtros, orden, respuesta SUNAT y acciones. */
export function Comprobantes() {
  const { empresa, puede } = useSesion()
  const qc = useQueryClient()
  const [borrador, setBorrador] = useState<Filtros>(VACIOS)
  const [filtros, setFiltros] = useState<Filtros>(VACIOS)
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState(25)
  const [orden, setOrden] = useState<{ campo: string; dir: 'asc' | 'desc' } | null>(null)
  const [verRespuesta, setVerRespuesta] = useState<ComprobanteFila | null>(null)
  const [anulando, setAnulando] = useState<ComprobanteFila | null>(null)

  const sucursales = useQuery({ queryKey: ['sucursales'], queryFn: () => api.get<Array<{ id: number; nombre: string }>>('/sucursales') })

  const params = new URLSearchParams({ pagina: String(pagina), por_pagina: String(porPagina) })
  if (filtros.buscar.trim()) params.set('buscar', filtros.buscar.trim())
  if (filtros.tipo) params.set('tipo_documento', filtros.tipo)
  if (filtros.estado) params.set('estado', filtros.estado)
  if (filtros.moneda) params.set('moneda', filtros.moneda)
  if (filtros.sucursal) params.set('sucursal_id', filtros.sucursal)
  if (filtros.serie.trim()) params.set('serie', filtros.serie.trim())
  if (filtros.desde) params.set('fecha_desde', filtros.desde)
  if (filtros.hasta) params.set('fecha_hasta', filtros.hasta)
  if (orden) {
    params.set('ordenar', orden.campo)
    params.set('direccion', orden.dir)
  }

  const lista = useQuery({
    queryKey: ['comprobantes', 'lista', params.toString()],
    queryFn: () => api.get<Pagina>(`/comprobantes?${params}`),
    // Mientras haya documentos en proceso, refresca solo
    refetchInterval: (q) => (q.state.data?.data.some((c) => EN_PROCESO.includes(c.sunat_estado)) ? 15_000 : false),
  })

  const accion = useMutation({
    mutationFn: ({ id, tipo }: { id: number; tipo: 'reconsultar' | 'reenviar' }) => api.post<ComprobanteFila>(`/comprobantes/${id}/${tipo}`),
    onSuccess: (c) => {
      const texto = `${c.numero_completo ?? 'Comprobante'}: ${ESTADOS[c.sunat_estado].etiqueta}`
      if (c.sunat_estado === 'aceptado') toast.success(texto)
      else if (c.sunat_estado === 'rechazado') toast.error(texto, { description: c.sunat_descripcion ?? undefined })
      else toast.info(texto)
      qc.invalidateQueries({ queryKey: ['comprobantes'] })
    },
    onError: (e) => toast.error(mensajeError(e)),
  })

  const aplicar = () => {
    setPagina(1)
    setFiltros(borrador)
  }
  const limpiar = () => {
    setBorrador(VACIOS)
    setFiltros(VACIOS)
    setPagina(1)
  }
  const ordenarPor = (campo: string) => {
    setPagina(1)
    setOrden((o) => (o?.campo !== campo ? { campo, dir: 'asc' } : o.dir === 'asc' ? { campo, dir: 'desc' } : null))
  }

  const r = lista.data?.resumen
  const meta = lista.data?.meta
  const total = meta?.total ?? 0
  const ultima = meta?.lastPage ?? meta?.last_page ?? 1
  const desde = total === 0 ? 0 : (pagina - 1) * porPagina + 1
  const hasta = Math.min(pagina * porPagina, total)
  const campo = (k: keyof Filtros) => ({
    value: borrador[k],
    onChange: (e: { target: { value: string } }) => setBorrador((b) => ({ ...b, [k]: e.target.value })),
  })

  return (
    <>
      <Encabezado
        titulo="Comprobantes de la empresa"
        descripcion={empresa ? `${empresa.razon_social} · RUC ${empresa.ruc}` : undefined}
        acciones={
          puede('comprobantes.emitir') && (
            <Link to="/ventas/emitir"><Boton><FilePlus2 className="size-4" /> Emitir comprobante</Boton></Link>
          )
        }
      />

      {/* Indicadores */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador titulo="Total" valor={r?.total} />
        <Indicador titulo="Facturas" valor={r?.facturas} clase="text-sky-600" />
        <Indicador titulo="Boletas" valor={r?.boletas} clase="text-violet-600" />
        <Indicador titulo="N. Crédito" valor={r?.notas_credito} clase="text-amber-600" />
        <Indicador titulo="N. Débito" valor={r?.notas_debito} clase="text-rose-600" />
        <Indicador titulo="Guías" valor={r?.guias} clase="text-teal-600" />
        <Indicador titulo="Aceptados" valor={r?.aceptados} clase="text-emerald-600" />
        <Indicador titulo="Monto total" valor={r ? soles(r.monto_total) : undefined} ayuda="Facturas, boletas y notas de débito menos notas de crédito; sin anulados ni rechazados." />
      </div>

      {/* Filtros */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          aplicar()
        }}
        className="mb-5 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Entrada className="pl-9" placeholder="Buscar número, cliente, RUC/DNI…" {...campo('buscar')} />
        </div>
        <Selector {...campo('tipo')}>
          <option value="">Todos los tipos</option>
          {Object.entries(TIPOS_DOCUMENTO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </Selector>
        <Selector {...campo('estado')}>
          <option value="">Todos los estados</option>
          {(Object.keys(ESTADOS) as EstadoSunat[]).map((e) => <option key={e} value={e}>{ESTADOS[e].etiqueta}</option>)}
        </Selector>
        <Selector {...campo('moneda')}>
          <option value="">Todas las monedas</option>
          <option value="PEN">Soles (PEN)</option>
          <option value="USD">Dólares (USD)</option>
        </Selector>
        <Selector {...campo('sucursal')}>
          <option value="">Todas las sucursales</option>
          {sucursales.data?.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </Selector>
        <Entrada placeholder="Serie" maxLength={4} className="uppercase placeholder:normal-case" {...campo('serie')} />
        <label className="flex items-center gap-2 text-xs text-slate-500">
          Desde <Entrada type="date" {...campo('desde')} />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-500">
          Hasta <Entrada type="date" {...campo('hasta')} />
        </label>
        <div className="flex gap-2 sm:col-span-1">
          <Boton type="submit" className="flex-1">Aplicar</Boton>
          <Boton type="button" variante="secundario" onClick={limpiar} title="Limpiar filtros"><X className="size-4" /></Boton>
        </div>
      </form>

      {/* Tabla */}
      {lista.isLoading ? (
        <Cargando />
      ) : !lista.data?.data.length ? (
        <Vacio icono={<FileText className="size-8" />} titulo="Sin comprobantes" texto="No hay comprobantes con estos filtros." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white lg:overflow-visible">
          <table className="w-full min-w-[60rem] text-sm lg:min-w-0">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                <th className="px-4 py-3 font-medium">Nº</th>
                <Th campo="tipo" orden={orden} onClick={ordenarPor}>Tipo</Th>
                <Th campo="numero" orden={orden} onClick={ordenarPor}>Número</Th>
                <Th campo="cliente" orden={orden} onClick={ordenarPor}>Cliente</Th>
                <Th campo="total" orden={orden} onClick={ordenarPor} derecha>Total</Th>
                <Th campo="estado" orden={orden} onClick={ordenarPor}>Estado</Th>
                <th className="px-4 py-3 font-medium uppercase tracking-wide">Respuesta</th>
                <Th campo="emision" orden={orden} onClick={ordenarPor}>Emisión</Th>
                <Th campo="envio" orden={orden} onClick={ordenarPor}>Envío</Th>
                <th className="w-12 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.data.data.map((c, i) => (
                <tr key={c.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 text-slate-500">{desde + i}</td>
                  <td className="px-4 py-3"><Insignia className="bg-slate-100 font-medium text-slate-700 ring-slate-200">{ETIQUETA_TIPO[c.tipo_documento] ?? c.tipo_documento}</Insignia></td>
                  <td className="px-4 py-3 font-semibold">
                    <Link to={`/ventas/comprobantes/${c.id}`} className="hover:text-acento-700 hover:underline">{c.numero_completo ?? `${c.serie}-…`}</Link>
                  </td>
                  <td className="max-w-[16rem] px-4 py-3">
                    <p className="truncate font-medium" title={c.cliente_razon_social}>{c.cliente_razon_social}</p>
                    <p className="text-xs text-slate-500">{c.cliente_num_doc}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">{soles(c.total, c.moneda)}</td>
                  <td className="px-4 py-3">
                    <EstadoSunatBadge estado={c.sunat_estado} codigo={c.sunat_codigo} descripcion={c.sunat_descripcion} notas={c.sunat_notas} />
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setVerRespuesta(c)} className="flex items-center gap-1.5 text-slate-700 hover:text-acento-700" disabled={!c.sunat_api_id && c.sunat_estado === 'pendiente'}>
                      <Eye className="size-4" /> Ver JSON
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums">{fecha(c.fecha_emision)}</td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-500">{c.sunat_enviado_en ? fecha(c.sunat_enviado_en) : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <MenuAcciones>
                      {(cerrar) => (
                        <>
                          {ANULABLES.includes(c.tipo_documento) && c.sunat_estado === 'aceptado' && puede('comprobantes.anular') && (
                            <Opcion peligro icono={Ban} onClick={() => { cerrar(); setAnulando(c) }}>Anular comprobante</Opcion>
                          )}
                          <Opcion icono={FileText} deshabilitado={!c.sunat_api_id} onClick={() => { cerrar(); void abrirPdf(c.id) }}>Ver / PDF</Opcion>
                          <Opcion icono={FileText} onClick={() => cerrar()} enlace={`/ventas/comprobantes/${c.id}`}>Ver detalle</Opcion>
                          <Opcion icono={Download} deshabilitado={!c.sunat_api_id} onClick={() => { cerrar(); void descargarArchivo(`/comprobantes/${c.id}/xml`) }}>Descargar XML</Opcion>
                          <Opcion icono={Download} deshabilitado={!c.sunat_api_id || !CON_CDR.includes(c.sunat_estado)} onClick={() => { cerrar(); void descargarArchivo(`/comprobantes/${c.id}/cdr`) }}>Descargar CDR</Opcion>
                          {EN_PROCESO.includes(c.sunat_estado) && (
                            <Opcion icono={RefreshCw} onClick={() => { cerrar(); accion.mutate({ id: c.id, tipo: 'reconsultar' }) }}>Consultar estado</Opcion>
                          )}
                          {(c.sunat_estado === 'rechazado' || c.sunat_estado === 'error_envio') && puede('comprobantes.emitir') && (
                            <Opcion icono={Send} onClick={() => { cerrar(); accion.mutate({ id: c.id, tipo: 'reenviar' }) }}>Reenviar a SUNAT</Opcion>
                          )}
                        </>
                      )}
                    </MenuAcciones>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginación */}
      {total > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span><b>{desde}-{hasta}</b> <span className="text-slate-500">de</span> <b>{total}</b></span>
          <Selector className="h-9 w-32" value={porPagina} onChange={(e) => { setPorPagina(Number(e.target.value)); setPagina(1) }}>
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} / pág.</option>)}
          </Selector>
          {ultima > 1 && (
            <div className="ml-auto flex items-center gap-2">
              <Boton variante="secundario" tamano="sm" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>Anterior</Boton>
              <span className="text-slate-500">Página {pagina} de {ultima}</span>
              <Boton variante="secundario" tamano="sm" disabled={pagina >= ultima} onClick={() => setPagina((p) => p + 1)}>Siguiente</Boton>
            </div>
          )}
        </div>
      )}

      {verRespuesta && <DialogoRespuesta comprobante={verRespuesta} onCerrar={() => setVerRespuesta(null)} />}
      {anulando && (
        <FormAnular comprobante={anulando} onCerrar={() => setAnulando(null)} onGuardado={() => qc.invalidateQueries({ queryKey: ['comprobantes'] })} />
      )}
    </>
  )
}

// ---------------------------------------------------------------- Piezas

function Indicador({ titulo, valor, clase, ayuda }: { titulo: string; valor: ReactNode; clase?: string; ayuda?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4" title={ayuda}>
      <p className="text-xs font-medium text-slate-600">{titulo}</p>
      <p className={cn('mt-1 text-xl font-bold tabular-nums', clase)}>{valor ?? '—'}</p>
    </div>
  )
}

function Th({ campo, orden, onClick, children, derecha }: { campo: string; orden: { campo: string; dir: string } | null; onClick: (c: string) => void; children: ReactNode; derecha?: boolean }) {
  const activo = orden?.campo === campo
  return (
    <th className={cn('px-4 py-3 font-medium', derecha && 'text-right')}>
      <button
        type="button"
        onClick={() => onClick(campo)}
        className={cn('inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-800', activo && 'text-acento-700', derecha && 'flex-row-reverse')}
        title="Ordenar"
      >
        {children}
        <ArrowDownUp className={cn('size-3', activo ? 'opacity-100' : 'opacity-40')} />
        {activo && <span className="sr-only">{orden!.dir === 'asc' ? 'ascendente' : 'descendente'}</span>}
      </button>
    </th>
  )
}

function MenuAcciones({ children }: { children: (cerrar: () => void) => ReactNode }) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!abierto) return
    const cerrar = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setAbierto(false)
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [abierto])
  return (
    <div ref={ref} className="relative inline-block">
      <button onClick={() => setAbierto((a) => !a)} className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50" title="Acciones" aria-haspopup="menu" aria-expanded={abierto}>
        <MoreHorizontal className="size-4" />
      </button>
      {abierto && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-slate-200 bg-white py-1 text-left shadow-lg">
          <p className="border-b border-slate-100 px-3 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Acciones</p>
          {children(() => setAbierto(false))}
        </div>
      )}
    </div>
  )
}

function Opcion({ icono: Icono, children, onClick, peligro, deshabilitado, enlace }: { icono: typeof Ban; children: ReactNode; onClick: () => void; peligro?: boolean; deshabilitado?: boolean; enlace?: string }) {
  const navegar = useNavigate()
  return (
    <button
      role="menuitem"
      disabled={deshabilitado}
      onClick={() => {
        onClick()
        if (enlace) navegar(enlace)
      }}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40',
        peligro ? 'text-rose-600' : 'text-slate-700'
      )}
    >
      <Icono className={cn('size-4', peligro ? 'text-rose-500' : 'text-sky-600')} />
      {children}
    </button>
  )
}

function DialogoRespuesta({ comprobante, onCerrar }: { comprobante: ComprobanteFila; onCerrar: () => void }) {
  const r = useQuery({
    queryKey: ['comprobantes', 'respuesta', comprobante.id],
    queryFn: () => api.get<Record<string, unknown>>(`/comprobantes/${comprobante.id}/respuesta`),
  })
  const texto = r.data ? JSON.stringify(r.data, null, 2) : ''
  return (
    <Dialogo abierto titulo={`Respuesta SUNAT · ${comprobante.numero_completo ?? comprobante.serie}`} onCerrar={onCerrar} ancho="max-w-3xl">
      {r.isLoading ? (
        <Cargando />
      ) : r.isError ? (
        <p className="text-sm text-rose-700">{mensajeError(r.error)}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <EstadoSunatBadge estado={comprobante.sunat_estado} codigo={comprobante.sunat_codigo} descripcion={comprobante.sunat_descripcion} notas={comprobante.sunat_notas} />
            {comprobante.sunat_descripcion && <span className="text-sm text-slate-600">{comprobante.sunat_descripcion}</span>}
            <Boton
              variante="secundario"
              tamano="sm"
              className="ml-auto"
              onClick={() => navigator.clipboard.writeText(texto).then(() => toast.success('JSON copiado.'))}
            >
              <Copy className="size-3.5" /> Copiar
            </Boton>
          </div>
          <pre className="max-h-[60vh] overflow-auto rounded-md bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">{texto}</pre>
        </div>
      )}
    </Dialogo>
  )
}
