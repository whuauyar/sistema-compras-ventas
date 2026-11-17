import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FilePlus2, FileText, RefreshCw, Search, Send } from 'lucide-react'
import { toast } from 'sonner'
import { api, mensajeError } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { ESTADOS, TIPOS_DOCUMENTO, type EstadoSunat } from '@/lib/sunat'
import { cn, fecha, soles } from '@/lib/utils'
import { EstadoSunatBadge } from '@/components/EstadoSunat'
import { MenuImpresion } from '@/components/MenuImpresion'
import { Boton, Cargando, Encabezado, Entrada, Tabla, Vacio } from '@/components/ui'

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
}

interface Pagina {
  meta: { total: number; currentPage: number; lastPage: number; current_page?: number; last_page?: number }
  data: ComprobanteFila[]
}

const CHIPS: EstadoSunat[] = ['rechazado', 'error_envio', 'pendiente', 'enviado', 'aceptado', 'anulado']

/** Bandeja de comprobantes con semáforo SUNAT, filtros por estado y acciones. */
export function Comprobantes() {
  const { puede } = useSesion()
  const qc = useQueryClient()
  const [estado, setEstado] = useState<EstadoSunat | null>(null)
  const [buscar, setBuscar] = useState('')
  const [pagina, setPagina] = useState(1)

  const resumen = useQuery({
    queryKey: ['comprobantes', 'resumen'],
    queryFn: () => api.get<Record<string, number>>('/comprobantes/resumen-estados'),
    refetchInterval: 30_000,
  })

  const params = new URLSearchParams({ pagina: String(pagina), por_pagina: '20' })
  if (estado) params.set('estado', estado)
  if (buscar.trim()) params.set('buscar', buscar.trim())
  const lista = useQuery({
    queryKey: ['comprobantes', 'lista', params.toString()],
    queryFn: () => api.get<Pagina>(`/comprobantes?${params}`),
    // Mientras haya documentos en proceso, refresca solo
    refetchInterval: (q) => (q.state.data?.data.some((c) => ['pendiente', 'enviado', 'error_envio', 'anulacion_en_proceso'].includes(c.sunat_estado)) ? 15_000 : false),
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

  const acciones = (c: ComprobanteFila) => (
    <div className="flex justify-end gap-1.5">
      {['pendiente', 'enviado', 'error_envio', 'anulacion_en_proceso'].includes(c.sunat_estado) && (
        <Boton variante="fantasma" tamano="sm" title="Consultar estado en SUNAT" cargando={accion.isPending && accion.variables?.id === c.id} onClick={() => accion.mutate({ id: c.id, tipo: 'reconsultar' })}>
          <RefreshCw className="size-3.5" />
        </Boton>
      )}
      {c.sunat_estado === 'rechazado' && puede('comprobantes.emitir') && (
        <Boton variante="fantasma" tamano="sm" title="Reenviar a SUNAT" onClick={() => accion.mutate({ id: c.id, tipo: 'reenviar' })}>
          <Send className="size-3.5" />
        </Boton>
      )}
      <MenuImpresion id={c.id} deshabilitado={!c.sunat_api_id} />
    </div>
  )

  const total = Object.values(resumen.data ?? {}).reduce((a, b) => a + b, 0)
  const meta = lista.data?.meta
  const ultima = meta?.lastPage ?? meta?.last_page ?? 1

  return (
    <>
      <Encabezado
        titulo="Comprobantes"
        descripcion="Facturas y boletas con su estado en SUNAT."
        acciones={
          puede('comprobantes.emitir') && (
            <Link to="/ventas/emitir">
              <Boton><FilePlus2 className="size-4" /> Emitir comprobante</Boton>
            </Link>
          )
        }
      />

      {/* Chips de estado con contadores */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Chip activo={estado === null} onClick={() => (setEstado(null), setPagina(1))} texto="Todos" n={total} />
        {CHIPS.map((e) => (
          <Chip key={e} activo={estado === e} onClick={() => (setEstado(e), setPagina(1))} texto={ESTADOS[e].etiqueta} n={resumen.data?.[e] ?? 0} clase={ESTADOS[e].clase} />
        ))}
      </div>

      <div className="mb-4 flex max-w-md items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-slate-400" />
          <Entrada className="pl-8" placeholder="Número, cliente o documento" value={buscar} onChange={(e) => (setBuscar(e.target.value), setPagina(1))} />
        </div>
      </div>

      {lista.isLoading ? (
        <Cargando />
      ) : !lista.data?.data.length ? (
        <Vacio icono={<FileText className="size-8" />} titulo="Sin comprobantes" texto={estado ? 'No hay comprobantes en este estado.' : 'Emita su primer comprobante para verlo aquí.'} />
      ) : (
        <>
          {/* Móvil: tarjetas */}
          <ul className="flex flex-col gap-2 md:hidden">
            {lista.data.data.map((c) => (
              <li key={c.id} className={cn('rounded-lg border border-slate-200 bg-white p-3', c.sunat_estado === 'rechazado' && 'border-rose-200')}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{c.numero_completo ?? `${c.serie}-…`} <span className="text-xs font-normal text-slate-500">{TIPOS_DOCUMENTO[c.tipo_documento]}</span></p>
                    <p className="truncate text-sm text-slate-600">{c.cliente_razon_social}</p>
                  </div>
                  <p className="font-semibold tabular-nums">{soles(c.total, c.moneda)}</p>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <EstadoSunatBadge estado={c.sunat_estado} codigo={c.sunat_codigo} descripcion={c.sunat_descripcion} notas={c.sunat_notas} />
                  {acciones(c)}
                </div>
                {c.sunat_estado === 'rechazado' && c.sunat_descripcion && <p className="mt-1 text-xs text-rose-700">{c.sunat_descripcion}</p>}
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
          <Tabla>
            <thead>
              <tr>
                <th>Comprobante</th>
                <th className="hidden md:table-cell">Fecha</th>
                <th>Cliente</th>
                <th className="text-right">Total</th>
                <th>SUNAT</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {lista.data.data.map((c) => (
                <tr key={c.id} className={cn(c.sunat_estado === 'rechazado' && 'bg-rose-50/40')}>
                  <td>
                    <p className="font-medium text-slate-900">{c.numero_completo ?? `${c.serie}-…`}</p>
                    <p className="text-xs text-slate-500">{TIPOS_DOCUMENTO[c.tipo_documento]}</p>
                  </td>
                  <td className="hidden whitespace-nowrap md:table-cell">{fecha(c.fecha_emision)}</td>
                  <td className="max-w-[14rem]">
                    <p className="truncate">{c.cliente_razon_social}</p>
                    <p className="text-xs text-slate-500">{c.cliente_num_doc}</p>
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums">{soles(c.total, c.moneda)}</td>
                  <td>
                    <EstadoSunatBadge estado={c.sunat_estado} codigo={c.sunat_codigo} descripcion={c.sunat_descripcion} notas={c.sunat_notas} />
                    {c.sunat_estado === 'rechazado' && c.sunat_descripcion && <p className="mt-1 max-w-[16rem] text-xs text-rose-700">{c.sunat_descripcion}</p>}
                  </td>
                  <td>{acciones(c)}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
          </div>
          {ultima > 1 && (
            <div className="mt-4 flex items-center justify-end gap-2 text-sm">
              <Boton variante="secundario" tamano="sm" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>Anterior</Boton>
              <span className="text-slate-500">Página {pagina} de {ultima}</span>
              <Boton variante="secundario" tamano="sm" disabled={pagina >= ultima} onClick={() => setPagina((p) => p + 1)}>Siguiente</Boton>
            </div>
          )}
        </>
      )}
    </>
  )
}

function Chip({ activo, onClick, texto, n, clase }: { activo: boolean; onClick: () => void; texto: string; n: number; clase?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm',
        activo ? 'border-acento-600 bg-acento-50 text-acento-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
      )}
    >
      {texto}
      <span className={cn('rounded-full px-1.5 text-xs tabular-nums ring-1 ring-inset', clase ?? 'bg-slate-100 text-slate-600 ring-slate-200')}>{n}</span>
    </button>
  )
}
