import { useEffect, useState, type ReactNode } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BadgeCheck, CircleAlert, CircleX, FileKey2, KeyRound, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { api, mensajeError } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { FORMATOS } from '@/lib/sunat'
import { cn } from '@/lib/utils'
import { Boton, Campo, Cargando, Encabezado, Entrada, Insignia, Selector, Tarjeta } from '@/components/ui'
import { SelectorUbigeo } from '@/components/SelectorUbigeo'

interface EmpresaLocal {
  ruc: string
  razon_social: string
  nombre_comercial: string | null
  direccion: string
  ubigeo: string
  regimen: string
  entorno: 'beta' | 'production'
  gre_configurada: boolean
  formato_impresion: string
  permitir_venta_sin_stock: boolean
  sunat_api_key: string
}

interface CuentaBancaria { banco: string; tipo_cuenta: string; moneda: 'PEN' | 'USD'; numero: string; cci?: string | null; titular?: string | null }
interface Billetera { tipo: 'yape' | 'plin' | 'tunki' | 'otro'; numero: string; titular?: string | null }

interface Remota {
  ruc: string
  razon_social: string
  nombre_comercial: string | null
  direccion: string | null
  ubigeo: string | null
  departamento: string | null
  provincia: string | null
  distrito: string | null
  tax_regime: 'general' | 'mype' | 'rer' | 'rus'
  nrus_categoria: 1 | 2 | null
  igv_rate_override: number | null
  tasa_igv_vigente: number | null
  entorno: 'beta' | 'production'
  sol_user: string | null
  tiene_sol_pass: boolean
  client_id: string | null
  tiene_client_secret: boolean
  tiene_certificado: boolean
  logo_url: string | null
  telefonos: string[]
  emails: string[]
  cuentas_bancarias: CuentaBancaria[]
  billeteras_digitales: Billetera[]
  mensaje_agradecimiento: string | null
  mensaje_promocional: string | null
  plan: string | null
  documentos_este_mes: number | null
  max_documentos_mes: number | null
}

interface ConfiguracionSunat {
  remota: Remota
  servicio: { disponible: boolean; circuit: string; fallas: number; entorno: string } | null
}

const REGIMENES = [
  { valor: 'general', etiqueta: 'Régimen General' },
  { valor: 'mype', etiqueta: 'Régimen MYPE Tributario' },
  { valor: 'rer', etiqueta: 'Régimen Especial (RER)' },
  { valor: 'rus', etiqueta: 'Nuevo RUS (solo boletas)' },
]

const PESTANAS = [
  { id: 'fiscal', texto: 'Datos fiscales' },
  { id: 'credenciales', texto: 'Credenciales SUNAT' },
  { id: 'certificado', texto: 'Certificado y logo' },
  { id: 'comprobantes', texto: 'En comprobantes' },
  { id: 'preferencias', texto: 'Preferencias' },
] as const
type Pestana = (typeof PESTANAS)[number]['id']

/** Configuración integral de la empresa contra la API SUNAT. */
export function ConfigEmpresa() {
  const { puede } = useSesion()
  const qc = useQueryClient()
  const editable = puede('config.empresa')
  const [pestana, setPestana] = useState<Pestana>('fiscal')
  const [sincronizando, setSincronizando] = useState(false)

  const local = useQuery({ queryKey: ['empresa'], queryFn: () => api.get<EmpresaLocal>('/empresa') })
  const config = useQuery({
    queryKey: ['empresa', 'sunat'],
    queryFn: () => api.get<ConfiguracionSunat>('/empresa/sunat'),
    enabled: editable,
    retry: false,
  })

  const refrescar = () => qc.invalidateQueries({ queryKey: ['empresa'] })
  const guardar = async (cambios: Record<string, unknown>, mensaje = 'Configuración actualizada en SUNAT.') => {
    try {
      await api.put('/empresa/sunat', cambios)
      toast.success(mensaje)
      await refrescar()
      return true
    } catch (e) {
      toast.error(mensajeError(e))
      return false
    }
  }
  const sincronizar = async () => {
    setSincronizando(true)
    try {
      await api.post('/empresa/sunat/sincronizar')
      toast.success('Datos sincronizados con la API SUNAT.')
      await refrescar()
    } catch (e) {
      toast.error(mensajeError(e))
    } finally {
      setSincronizando(false)
    }
  }

  if (local.isLoading || !local.data) return <Cargando />
  if (!editable) return <SoloLectura empresa={local.data} />
  if (config.isLoading) return <Cargando texto="Consultando la API SUNAT…" />
  if (config.isError || !config.data)
    return (
      <>
        <Encabezado titulo="Empresa" />
        <Tarjeta>
          <p className="flex items-center gap-2 text-sm text-rose-700"><CircleX className="size-4" /> {mensajeError(config.error)}</p>
          <Boton variante="secundario" className="mt-4" onClick={() => config.refetch()}>Reintentar</Boton>
        </Tarjeta>
      </>
    )

  const { remota, servicio } = config.data
  return (
    <>
      <Encabezado
        titulo="Empresa"
        descripcion={`RUC ${remota.ruc} · Configuración sincronizada con la API SUNAT.`}
        acciones={<Boton variante="secundario" onClick={sincronizar} cargando={sincronizando}><RefreshCw className="size-4" /> Sincronizar</Boton>}
      />
      <Resumen remota={remota} servicio={servicio} />

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPestana(p.id)}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm',
              pestana === p.id ? 'border-acento-600 font-medium text-acento-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            )}
          >
            {p.texto}
          </button>
        ))}
      </div>

      {pestana === 'fiscal' && <DatosFiscales remota={remota} guardar={guardar} />}
      {pestana === 'credenciales' && <Credenciales remota={remota} apiKey={local.data.sunat_api_key} guardar={guardar} refrescar={refrescar} />}
      {pestana === 'certificado' && <CertificadoLogo remota={remota} refrescar={refrescar} />}
      {pestana === 'comprobantes' && <EnComprobantes remota={remota} guardar={guardar} />}
      {pestana === 'preferencias' && <Preferencias empresa={local.data} />}
    </>
  )
}

// ---------------------------------------------------------------- Resumen de estado

function Chip({ ok, alerta, titulo, texto }: { ok: boolean; alerta?: boolean; titulo: string; texto: ReactNode }) {
  const Icono = ok ? BadgeCheck : alerta ? CircleAlert : CircleX
  return (
    <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3">
      <Icono className={cn('mt-0.5 size-4 shrink-0', ok ? 'text-emerald-600' : alerta ? 'text-amber-600' : 'text-rose-600')} />
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{titulo}</p>
        <p className="truncate text-sm font-medium">{texto}</p>
      </div>
    </div>
  )
}

function Resumen({ remota, servicio }: { remota: Remota; servicio: ConfiguracionSunat['servicio'] }) {
  const uso = remota.max_documentos_mes ? `${remota.documentos_este_mes ?? 0} / ${remota.max_documentos_mes}` : `${remota.documentos_este_mes ?? 0}`
  return (
    <div className="mb-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <Chip ok={remota.entorno === 'production'} alerta={remota.entorno === 'beta'} titulo="Entorno" texto={remota.entorno === 'beta' ? 'Pruebas (beta)' : 'Producción'} />
      <Chip ok={Boolean(servicio?.disponible)} alerta={!servicio} titulo="Servicio SUNAT" texto={!servicio ? 'Sin datos' : servicio.disponible ? 'Disponible' : 'Con fallas'} />
      <Chip ok={remota.tiene_certificado} titulo="Certificado digital" texto={remota.tiene_certificado ? 'Cargado' : 'Falta'} />
      <Chip ok={Boolean(remota.sol_user && remota.tiene_sol_pass)} titulo="Clave SOL" texto={remota.sol_user ? remota.sol_user : 'Falta'} />
      <Chip ok={Boolean(remota.client_id && remota.tiene_client_secret)} alerta titulo="Guías (GRE)" texto={remota.client_id && remota.tiene_client_secret ? 'Configuradas' : 'Sin credenciales'} />
      <Chip ok alerta={false} titulo={`Documentos del mes${remota.plan ? ` · plan ${remota.plan}` : ''}`} texto={uso} />
    </div>
  )
}

type Guardar = (cambios: Record<string, unknown>, mensaje?: string) => Promise<boolean>

// ---------------------------------------------------------------- Datos fiscales

function DatosFiscales({ remota, guardar }: { remota: Remota; guardar: Guardar }) {
  const { register, handleSubmit, watch, setValue, formState } = useForm({
    defaultValues: {
      razon_social: remota.razon_social,
      nombre_comercial: remota.nombre_comercial ?? '',
      direccion: remota.direccion ?? '',
      ubigeo: remota.ubigeo ?? '',
      departamento: remota.departamento ?? '',
      provincia: remota.provincia ?? '',
      distrito: remota.distrito ?? '',
      tax_regime: remota.tax_regime,
      nrus_categoria: remota.nrus_categoria ? String(remota.nrus_categoria) : '',
      igv_especial: remota.igv_rate_override !== null && remota.igv_rate_override !== undefined ? String(remota.igv_rate_override) : '',
    },
  })
  const regimen = watch('tax_regime')
  const enviar = handleSubmit(async (d) => {
    await guardar({
      razon_social: d.razon_social,
      nombre_comercial: d.nombre_comercial || null,
      direccion: d.direccion,
      ...(d.ubigeo ? { ubigeo: d.ubigeo, departamento: d.departamento, provincia: d.provincia, distrito: d.distrito } : {}),
      tax_regime: d.tax_regime,
      nrus_categoria: d.tax_regime === 'rus' && d.nrus_categoria ? Number(d.nrus_categoria) : null,
      igv_rate_override: d.igv_especial === '' ? null : Number(d.igv_especial),
    })
  })
  return (
    <Tarjeta titulo="Datos fiscales" descripcion="Se imprimen en los comprobantes y deben coincidir con la Ficha RUC.">
      <form onSubmit={enviar} className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="RUC"><Entrada value={remota.ruc} disabled /></Campo>
        <Campo etiqueta="Razón social"><Entrada {...register('razon_social', { required: true })} /></Campo>
        <Campo etiqueta="Nombre comercial"><Entrada {...register('nombre_comercial')} /></Campo>
        <Campo etiqueta="Dirección fiscal"><Entrada {...register('direccion', { required: true })} /></Campo>
        <SelectorUbigeo
          valor={watch('ubigeo')}
          onCambio={(u) => {
            setValue('ubigeo', u.ubigeo, { shouldDirty: true })
            setValue('departamento', u.departamento)
            setValue('provincia', u.provincia)
            setValue('distrito', u.distrito)
          }}
        />
        <Campo etiqueta="Régimen tributario">
          <Selector {...register('tax_regime')}>{REGIMENES.map((r) => <option key={r.valor} value={r.valor}>{r.etiqueta}</option>)}</Selector>
        </Campo>
        {regimen === 'rus' ? (
          <Campo etiqueta="Categoría Nuevo RUS">
            <Selector {...register('nrus_categoria')}><option value="">Sin categoría</option><option value="1">Categoría 1</option><option value="2">Categoría 2</option></Selector>
          </Campo>
        ) : (
          <Campo etiqueta="Tasa de IGV especial (%)" ayuda={`Vacío = tasa normal. Vigente hoy: ${remota.tasa_igv_vigente !== null ? `${(remota.tasa_igv_vigente * 100).toFixed(1)} %` : '—'} (p. ej. restaurantes, Ley 31556).`}>
            <Entrada type="number" step="0.01" min={0} max={30} {...register('igv_especial')} />
          </Campo>
        )}
        <div className="sm:col-span-2"><Boton type="submit" cargando={formState.isSubmitting}>Guardar datos fiscales</Boton></div>
      </form>
    </Tarjeta>
  )
}

// ---------------------------------------------------------------- Credenciales

function Credenciales({ remota, apiKey, guardar, refrescar }: { remota: Remota; apiKey: string; guardar: Guardar; refrescar: () => Promise<unknown> }) {
  const { register, handleSubmit, reset, formState } = useForm({
    defaultValues: { sol_user: remota.sol_user ?? '', sol_pass: '', client_id: remota.client_id ?? '', client_secret: '', entorno: remota.entorno },
  })
  const [rotando, setRotando] = useState(false)

  const enviar = handleSubmit(async (d) => {
    const cambios: Record<string, unknown> = { entorno: d.entorno }
    if (d.sol_user) cambios.sol_user = d.sol_user
    if (d.sol_pass) cambios.sol_pass = d.sol_pass
    if (d.client_id) cambios.client_id = d.client_id
    if (d.client_secret) cambios.client_secret = d.client_secret
    if (d.entorno === 'production' && remota.entorno !== 'production') {
      if (!window.confirm('En PRODUCCIÓN los comprobantes tienen validez legal ante SUNAT y no se pueden borrar. ¿Confirma el cambio?')) return
      cambios.confirmar_produccion = true
    }
    if (await guardar(cambios, 'Credenciales actualizadas en SUNAT.')) reset({ ...d, sol_pass: '', client_secret: '' })
  })

  const regenerar = async () => {
    if (!window.confirm('Se generarán nuevas credenciales de la API y las actuales dejarán de funcionar al instante. Este sistema guarda las nuevas automáticamente. ¿Continuar?')) return
    setRotando(true)
    try {
      await api.post('/empresa/sunat/credenciales/regenerar')
      toast.success('Credenciales de la API renovadas.')
      await refrescar()
    } catch (e) {
      toast.error(mensajeError(e))
    } finally {
      setRotando(false)
    }
  }

  const guardado = (si: boolean) => (si ? '•••••••• guardada — escriba solo para cambiarla' : 'Sin configurar')
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Tarjeta titulo="SUNAT" descripcion="Las claves se envían cifradas a la API y nunca se muestran de vuelta.">
        <form onSubmit={enviar} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Usuario SOL" ayuda="Usuario secundario creado en SUNAT Operaciones en Línea."><Entrada autoComplete="off" {...register('sol_user')} /></Campo>
            <Campo etiqueta="Clave SOL"><Entrada type="password" autoComplete="new-password" placeholder={guardado(remota.tiene_sol_pass)} {...register('sol_pass')} /></Campo>
            <Campo etiqueta="Client ID (GRE)" ayuda="API de guías de remisión electrónicas."><Entrada autoComplete="off" {...register('client_id')} /></Campo>
            <Campo etiqueta="Client Secret (GRE)"><Entrada type="password" autoComplete="new-password" placeholder={guardado(remota.tiene_client_secret)} {...register('client_secret')} /></Campo>
          </div>
          <Campo etiqueta="Entorno" ayuda="Beta es para pruebas: los comprobantes no tienen validez legal.">
            <Selector {...register('entorno')}><option value="beta">Pruebas (beta)</option><option value="production">Producción</option></Selector>
          </Campo>
          <Boton type="submit" cargando={formState.isSubmitting} className="self-start">Guardar credenciales</Boton>
        </form>
      </Tarjeta>
      <Tarjeta titulo="Acceso a la API de facturación" descripcion="Credenciales con las que este sistema se conecta a la API SUNAT.">
        <dl className="grid grid-cols-3 gap-y-2 text-sm">
          <dt className="text-slate-500">API Key</dt><dd className="col-span-2 font-mono text-xs">{apiKey}</dd>
          <dt className="text-slate-500">API Secret</dt><dd className="col-span-2 text-slate-500">Guardado cifrado</dd>
        </dl>
        <p className="mt-4 text-sm text-slate-500">Si sospecha que se filtraron, renuévelas. Las anteriores dejan de funcionar al instante.</p>
        <Boton variante="secundario" className="mt-3 text-rose-600" onClick={regenerar} cargando={rotando}><KeyRound className="size-4" /> Renovar credenciales de la API</Boton>
      </Tarjeta>
    </div>
  )
}

// ---------------------------------------------------------------- Certificado y logo

function CertificadoLogo({ remota, refrescar }: { remota: Remota; refrescar: () => Promise<unknown> }) {
  const [certificado, setCertificado] = useState<File | null>(null)
  const [contrasena, setContrasena] = useState('')
  const [logo, setLogo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState<'cert' | 'logo' | null>(null)
  const necesitaClave = certificado ? /\.(pfx|p12)$/i.test(certificado.name) : false

  const subir = async (tipo: 'cert' | 'logo') => {
    const form = new FormData()
    if (tipo === 'cert') {
      form.append('certificado', certificado!)
      if (contrasena) form.append('contrasena_certificado', contrasena)
    } else form.append('logo', logo!)
    setEnviando(tipo)
    try {
      await api.post(`/empresa/sunat/${tipo === 'cert' ? 'certificado' : 'logo'}`, form)
      toast.success(tipo === 'cert' ? 'Certificado actualizado en SUNAT.' : 'Logo actualizado.')
      if (tipo === 'cert') { setCertificado(null); setContrasena('') } else setLogo(null)
      await refrescar()
    } catch (e) {
      toast.error(mensajeError(e))
    } finally {
      setEnviando(null)
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Tarjeta titulo="Certificado digital" descripcion="Con él se firman los XML. Formatos: .pfx, .p12 (con contraseña), .pem, .cer, .crt; máx. 100 KB.">
        <p className="mb-4 flex items-center gap-2 text-sm">
          <FileKey2 className="size-4 text-slate-400" />
          {remota.tiene_certificado ? <span className="text-emerald-700">Hay un certificado cargado.</span> : <span className="text-rose-700">Falta el certificado: no podrá emitir.</span>}
        </p>
        <div className="flex flex-col gap-4">
          <Campo etiqueta="Archivo"><Entrada type="file" accept=".pfx,.p12,.pem,.cer,.crt" onChange={(e) => setCertificado(e.target.files?.[0] ?? null)} /></Campo>
          {necesitaClave && <Campo etiqueta="Contraseña del certificado"><Entrada type="password" autoComplete="off" value={contrasena} onChange={(e) => setContrasena(e.target.value)} /></Campo>}
          <Boton className="self-start" disabled={!certificado || (necesitaClave && !contrasena)} cargando={enviando === 'cert'} onClick={() => subir('cert')}>
            {remota.tiene_certificado ? 'Reemplazar certificado' : 'Subir certificado'}
          </Boton>
        </div>
      </Tarjeta>
      <Tarjeta titulo="Logo" descripcion="Aparece en el PDF de los comprobantes. JPG, PNG o WEBP; máx. 2 MB.">
        <div className="mb-4 grid h-20 place-items-center rounded-md border border-dashed border-slate-300 bg-slate-50">
          {logo ? <img src={URL.createObjectURL(logo)} alt="Vista previa" className="max-h-16" /> : remota.logo_url ? <img src={remota.logo_url} alt="Logo actual" className="max-h-16" /> : <span className="text-sm text-slate-400">Sin logo</span>}
        </div>
        <div className="flex flex-col gap-4">
          <Entrada type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
          <Boton className="self-start" disabled={!logo} cargando={enviando === 'logo'} onClick={() => subir('logo')}>Subir logo</Boton>
        </div>
      </Tarjeta>
    </div>
  )
}

// ---------------------------------------------------------------- Datos que se imprimen

function EnComprobantes({ remota, guardar }: { remota: Remota; guardar: Guardar }) {
  const { register, control, handleSubmit, formState } = useForm({
    defaultValues: {
      telefonos: remota.telefonos.join(', '),
      emails: remota.emails.join(', '),
      cuentas_bancarias: remota.cuentas_bancarias,
      billeteras_digitales: remota.billeteras_digitales,
      mensaje_agradecimiento: remota.mensaje_agradecimiento ?? '',
      mensaje_promocional: remota.mensaje_promocional ?? '',
    },
  })
  const cuentas = useFieldArray({ control, name: 'cuentas_bancarias' })
  const billeteras = useFieldArray({ control, name: 'billeteras_digitales' })
  const lista = (t: string) => t.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 5)

  const enviar = handleSubmit(async (d) => {
    await guardar(
      {
        telefonos: lista(d.telefonos),
        emails: lista(d.emails),
        cuentas_bancarias: d.cuentas_bancarias.map((c) => ({ ...c, cci: c.cci || null, titular: c.titular || null })),
        billeteras_digitales: d.billeteras_digitales.map((b) => ({ ...b, titular: b.titular || null })),
        mensaje_agradecimiento: d.mensaje_agradecimiento || null,
        mensaje_promocional: d.mensaje_promocional || null,
      },
      'Datos de impresión actualizados.'
    )
  })

  return (
    <Tarjeta titulo="Datos que se imprimen en el comprobante" descripcion="Contacto, cuentas para pagos y mensajes al pie del PDF.">
      <form onSubmit={enviar} className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Teléfonos" ayuda="Separados por coma (máx. 5)."><Entrada {...register('telefonos')} /></Campo>
          <Campo etiqueta="Correos" ayuda="Separados por coma (máx. 5)."><Entrada {...register('emails')} /></Campo>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Cuentas bancarias</legend>
          {cuentas.fields.map((f, i) => (
            <div key={f.id} className="grid items-end gap-2 sm:grid-cols-[1fr_8rem_6rem_1fr_1fr_auto]">
              <Campo etiqueta="Banco"><Entrada {...register(`cuentas_bancarias.${i}.banco`, { required: true })} /></Campo>
              <Campo etiqueta="Tipo"><Entrada placeholder="Corriente" {...register(`cuentas_bancarias.${i}.tipo_cuenta`, { required: true })} /></Campo>
              <Campo etiqueta="Moneda"><Selector {...register(`cuentas_bancarias.${i}.moneda`)}><option value="PEN">PEN</option><option value="USD">USD</option></Selector></Campo>
              <Campo etiqueta="Número"><Entrada {...register(`cuentas_bancarias.${i}.numero`, { required: true })} /></Campo>
              <Campo etiqueta="CCI"><Entrada {...register(`cuentas_bancarias.${i}.cci`)} /></Campo>
              <Boton type="button" variante="fantasma" className="text-rose-600" onClick={() => cuentas.remove(i)} title="Quitar"><Trash2 className="size-4" /></Boton>
            </div>
          ))}
          {cuentas.fields.length < 5 && (
            <Boton type="button" variante="fantasma" tamano="sm" className="self-start" onClick={() => cuentas.append({ banco: '', tipo_cuenta: '', moneda: 'PEN', numero: '', cci: '', titular: '' })}>
              <Plus className="size-3.5" /> Agregar cuenta
            </Boton>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Billeteras digitales</legend>
          {billeteras.fields.map((f, i) => (
            <div key={f.id} className="grid items-end gap-2 sm:grid-cols-[8rem_1fr_1fr_auto]">
              <Campo etiqueta="Tipo"><Selector {...register(`billeteras_digitales.${i}.tipo`)}><option value="yape">Yape</option><option value="plin">Plin</option><option value="tunki">Tunki</option><option value="otro">Otro</option></Selector></Campo>
              <Campo etiqueta="Número"><Entrada {...register(`billeteras_digitales.${i}.numero`, { required: true })} /></Campo>
              <Campo etiqueta="Titular"><Entrada {...register(`billeteras_digitales.${i}.titular`)} /></Campo>
              <Boton type="button" variante="fantasma" className="text-rose-600" onClick={() => billeteras.remove(i)} title="Quitar"><Trash2 className="size-4" /></Boton>
            </div>
          ))}
          {billeteras.fields.length < 5 && (
            <Boton type="button" variante="fantasma" tamano="sm" className="self-start" onClick={() => billeteras.append({ tipo: 'yape', numero: '', titular: '' })}>
              <Plus className="size-3.5" /> Agregar billetera
            </Boton>
          )}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Mensaje de agradecimiento"><Entrada maxLength={500} {...register('mensaje_agradecimiento')} /></Campo>
          <Campo etiqueta="Mensaje promocional"><Entrada maxLength={500} {...register('mensaje_promocional')} /></Campo>
        </div>
        <Boton type="submit" cargando={formState.isSubmitting} className="self-start">Guardar</Boton>
      </form>
    </Tarjeta>
  )
}

// ---------------------------------------------------------------- Preferencias locales

function Preferencias({ empresa }: { empresa: EmpresaLocal }) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset, formState } = useForm<Pick<EmpresaLocal, 'formato_impresion' | 'permitir_venta_sin_stock'>>()
  useEffect(() => {
    reset({ formato_impresion: empresa.formato_impresion, permitir_venta_sin_stock: empresa.permitir_venta_sin_stock })
  }, [empresa, reset])
  const guardar = handleSubmit(async (d) => {
    try {
      await api.put('/empresa', d)
      toast.success('Preferencias guardadas.')
      qc.invalidateQueries({ queryKey: ['empresa'] })
    } catch (e) {
      toast.error(mensajeError(e))
    }
  })
  return (
    <Tarjeta titulo="Preferencias de este sistema" descripcion="No se envían a SUNAT.">
      <form onSubmit={guardar} className="flex max-w-md flex-col gap-4">
        <Campo etiqueta="Formato de impresión por defecto" ayuda="Cada sucursal, caja o usuario puede tener el suyo.">
          <Selector {...register('formato_impresion')}>{FORMATOS.map((f) => <option key={f.valor} value={f.valor}>{f.etiqueta}</option>)}</Selector>
        </Campo>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-acento-600" {...register('permitir_venta_sin_stock')} /> Permitir vender sin stock
        </label>
        <Boton type="submit" cargando={formState.isSubmitting} className="self-start">Guardar</Boton>
      </form>
    </Tarjeta>
  )
}

// ---------------------------------------------------------------- Sin permiso de configuración

function SoloLectura({ empresa }: { empresa: EmpresaLocal }) {
  return (
    <>
      <Encabezado titulo="Empresa" descripcion="Solo lectura." />
      <Tarjeta titulo="Datos fiscales">
        <dl className="grid grid-cols-3 gap-y-2 text-sm">
          <dt className="text-slate-500">RUC</dt><dd className="col-span-2 font-medium">{empresa.ruc}</dd>
          <dt className="text-slate-500">Razón social</dt><dd className="col-span-2">{empresa.razon_social}</dd>
          <dt className="text-slate-500">Dirección</dt><dd className="col-span-2">{empresa.direccion}</dd>
          <dt className="text-slate-500">Entorno</dt>
          <dd className="col-span-2">{empresa.entorno === 'beta' ? <Insignia className="bg-amber-50 text-amber-700 ring-amber-200">Pruebas (beta)</Insignia> : <Insignia className="bg-emerald-50 text-emerald-700 ring-emerald-200">Producción</Insignia>}</dd>
        </dl>
      </Tarjeta>
    </>
  )
}
