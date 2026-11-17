import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { api, mensajeError } from '@/lib/api'
import { fecha } from '@/lib/utils'
import { EstadoSunatBadge } from '@/components/EstadoSunat'
import { MenuImpresion } from '@/components/MenuImpresion'
import { Paginacion } from '@/components/comunes'
import { Boton, Campo, Cargando, Dialogo, Encabezado, Entrada, Selector, Tabla, Vacio } from '@/components/ui'
import type { ComprobanteFila } from '../Comprobantes'
import type { Paginado } from '@/lib/tipos'

const MOTIVOS_TRASLADO: Record<string, string> = {
  '01': 'Venta', '02': 'Compra', '04': 'Traslado entre establecimientos', '08': 'Importación', '09': 'Exportación', '13': 'Otros', '14': 'Venta sujeta a confirmación', '18': 'Traslado emisor itinerante',
}

export function Guias() {
  const qc = useQueryClient()
  const [pagina, setPagina] = useState(1)
  const [nueva, setNueva] = useState(false)
  const lista = useQuery({
    queryKey: ['comprobantes', 'guias', pagina],
    queryFn: () => api.get<Paginado<ComprobanteFila>>(`/comprobantes?tipo_documento=09&pagina=${pagina}`),
  })
  return (
    <>
      <Encabezado titulo="Guías de remisión" descripcion="Guías remitente (09). Requieren credenciales GRE configuradas en la empresa." acciones={<Boton onClick={() => setNueva(true)}><Plus className="size-4" /> Nueva guía</Boton>} />
      {lista.isLoading ? <Cargando /> : !lista.data?.data.length ? (
        <Vacio icono={<Truck className="size-8" />} titulo="Sin guías" texto="También puede emitirlas desde el detalle de una venta." />
      ) : (
        <>
          <Tabla>
            <thead><tr><th>Guía</th><th>Fecha</th><th>Destinatario</th><th>SUNAT</th><th /></tr></thead>
            <tbody>
              {lista.data.data.map((g) => (
                <tr key={g.id}>
                  <td><Link className="font-medium text-acento-700 hover:underline" to={`/ventas/comprobantes/${g.id}`}>{g.numero_completo ?? `${g.serie}-…`}</Link></td>
                  <td>{fecha(g.fecha_emision)}</td>
                  <td>{g.cliente_razon_social}</td>
                  <td><EstadoSunatBadge estado={g.sunat_estado} codigo={g.sunat_codigo} descripcion={g.sunat_descripcion} /></td>
                  <td className="text-right"><MenuImpresion id={g.id} deshabilitado={!g.sunat_api_id} /></td>
                </tr>
              ))}
            </tbody>
          </Tabla>
          <Paginacion meta={lista.data.meta} pagina={pagina} onCambio={setPagina} />
        </>
      )}
      {nueva && <FormGuia onCerrar={() => setNueva(false)} onGuardado={() => qc.invalidateQueries({ queryKey: ['comprobantes'] })} />}
    </>
  )
}

export function FormGuia({ ventaId, destinatario, onCerrar, onGuardado }: { ventaId?: number; destinatario?: { tipo_doc: '1' | '6'; num_doc: string; razon_social: string }; onCerrar: () => void; onGuardado: () => void }) {
  const manana = new Date(Date.now() + 864e5).toISOString().slice(0, 10)
  const [f, setF] = useState({
    dest_tipo: destinatario?.tipo_doc ?? '6', dest_num: destinatario?.num_doc ?? '', dest_nombre: destinatario?.razon_social ?? '',
    cod_traslado: '01', mod_traslado: '02', fecha_traslado: manana, peso_total: '', num_bultos: '1',
    partida_ubigeo: '', partida_direccion: '', llegada_ubigeo: '', llegada_direccion: '',
    placa: '', cond_doc: '', cond_licencia: '', cond_nombres: '', cond_apellidos: '',
    tr_ruc: '', tr_nombre: '', tr_mtc: '', fecha_entrega: manana,
    item_desc: '', item_cant: '1',
  })
  const [enviando, setEnviando] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const privado = f.mod_traslado === '02'

  const emitir = async () => {
    setEnviando(true)
    try {
      await api.post('/guias', {
        venta_id: ventaId ?? null,
        destinatario: { tipo_doc: f.dest_tipo, num_doc: f.dest_num, razon_social: f.dest_nombre },
        cod_traslado: f.cod_traslado, mod_traslado: f.mod_traslado, fecha_traslado: f.fecha_traslado,
        peso_total: Number(f.peso_total), num_bultos: Number(f.num_bultos) || null,
        partida: { ubigeo: f.partida_ubigeo, direccion: f.partida_direccion },
        llegada: { ubigeo: f.llegada_ubigeo, direccion: f.llegada_direccion },
        vehiculo: privado ? { placa: f.placa } : null,
        conductor: privado ? { tipo_doc: '1', num_doc: f.cond_doc, licencia: f.cond_licencia, nombres: f.cond_nombres, apellidos: f.cond_apellidos } : null,
        transportista: privado ? null : { tipo_doc: '6', num_doc: f.tr_ruc, razon_social: f.tr_nombre, nro_mtc: f.tr_mtc || null },
        fecha_entrega_transportista: privado ? null : f.fecha_entrega,
        items: ventaId ? undefined : [{ descripcion: f.item_desc, cantidad: Number(f.item_cant) }],
      })
      toast.success('Guía enviada a SUNAT.')
      onGuardado()
      onCerrar()
    } catch (e) {
      toast.error(mensajeError(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialogo abierto titulo="Guía de remisión remitente" onCerrar={onCerrar} ancho="max-w-3xl">
      <div className="grid gap-3 sm:grid-cols-4">
        <Campo etiqueta="Destinatario"><Selector value={f.dest_tipo} onChange={set('dest_tipo')}><option value="6">RUC</option><option value="1">DNI</option></Selector></Campo>
        <Campo etiqueta="Número"><Entrada value={f.dest_num} onChange={set('dest_num')} /></Campo>
        <Campo etiqueta="Nombre / razón social" className="sm:col-span-2"><Entrada value={f.dest_nombre} onChange={set('dest_nombre')} /></Campo>
        <Campo etiqueta="Motivo"><Selector value={f.cod_traslado} onChange={set('cod_traslado')}>{Object.entries(MOTIVOS_TRASLADO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Selector></Campo>
        <Campo etiqueta="Modalidad"><Selector value={f.mod_traslado} onChange={set('mod_traslado')}><option value="02">Privado (vehículo propio)</option><option value="01">Público (transportista)</option></Selector></Campo>
        <Campo etiqueta="Fecha de traslado"><Entrada type="date" value={f.fecha_traslado} onChange={set('fecha_traslado')} /></Campo>
        <Campo etiqueta="Peso total (kg)"><Entrada type="number" step="0.01" value={f.peso_total} onChange={set('peso_total')} /></Campo>
        <Campo etiqueta="Ubigeo partida"><Entrada maxLength={6} value={f.partida_ubigeo} onChange={set('partida_ubigeo')} /></Campo>
        <Campo etiqueta="Dirección partida" className="sm:col-span-3"><Entrada value={f.partida_direccion} onChange={set('partida_direccion')} /></Campo>
        <Campo etiqueta="Ubigeo llegada"><Entrada maxLength={6} value={f.llegada_ubigeo} onChange={set('llegada_ubigeo')} /></Campo>
        <Campo etiqueta="Dirección llegada" className="sm:col-span-3"><Entrada value={f.llegada_direccion} onChange={set('llegada_direccion')} /></Campo>
        {privado ? (
          <>
            <Campo etiqueta="Placa"><Entrada className="uppercase" value={f.placa} onChange={set('placa')} /></Campo>
            <Campo etiqueta="DNI conductor"><Entrada value={f.cond_doc} onChange={set('cond_doc')} /></Campo>
            <Campo etiqueta="Licencia"><Entrada value={f.cond_licencia} onChange={set('cond_licencia')} /></Campo>
            <Campo etiqueta="Bultos"><Entrada type="number" value={f.num_bultos} onChange={set('num_bultos')} /></Campo>
            <Campo etiqueta="Nombres conductor" className="sm:col-span-2"><Entrada value={f.cond_nombres} onChange={set('cond_nombres')} /></Campo>
            <Campo etiqueta="Apellidos conductor" className="sm:col-span-2"><Entrada value={f.cond_apellidos} onChange={set('cond_apellidos')} /></Campo>
          </>
        ) : (
          <>
            <Campo etiqueta="RUC transportista"><Entrada value={f.tr_ruc} onChange={set('tr_ruc')} /></Campo>
            <Campo etiqueta="Razón social" className="sm:col-span-2"><Entrada value={f.tr_nombre} onChange={set('tr_nombre')} /></Campo>
            <Campo etiqueta="N.º MTC"><Entrada value={f.tr_mtc} onChange={set('tr_mtc')} /></Campo>
            <Campo etiqueta="Entrega al transportista"><Entrada type="date" value={f.fecha_entrega} onChange={set('fecha_entrega')} /></Campo>
          </>
        )}
        {!ventaId && (
          <>
            <Campo etiqueta="Bien a trasladar" className="sm:col-span-3"><Entrada value={f.item_desc} onChange={set('item_desc')} /></Campo>
            <Campo etiqueta="Cantidad"><Entrada type="number" value={f.item_cant} onChange={set('item_cant')} /></Campo>
          </>
        )}
        {ventaId && <p className="text-sm text-slate-500 sm:col-span-4">Los bienes se toman de la venta (sin servicios).</p>}
      </div>
      <Boton className="mt-4" onClick={emitir} cargando={enviando} disabled={!Number(f.peso_total) || !f.dest_num}>Emitir guía</Boton>
    </Dialogo>
  )
}
