import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Building2, KeyRound, TriangleAlert, UserRoundCog } from 'lucide-react'
import type { UseFormRegister } from 'react-hook-form'
import { api, ApiError, mensajeError } from '@/lib/api'
import { Boton, Campo, Entrada, Selector, Tarjeta } from '@/components/ui'
import { cn } from '@/lib/utils'

interface RespuestaAlta {
  empresa: { id: number; razon_social: string }
  advertencias: string[]
}

function useErroresCampo() {
  const [errores, setErrores] = useState<Record<string, string>>({})
  const capturar = (e: unknown) => {
    if (e instanceof ApiError && e.errores.length) setErrores(Object.fromEntries(e.errores.map((x) => [x.campo, x.mensaje])))
    toast.error(mensajeError(e))
  }
  return { errores, capturar, limpiar: () => setErrores({}) }
}

/** Datos del usuario que quedará como Administrador de la empresa. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- se comparte entre dos formularios
function CamposAdministrador({ register, errores }: { register: UseFormRegister<any>; errores: Record<string, string> }) {
  return (
    <fieldset className="grid gap-4 rounded-md border border-slate-200 p-4 sm:col-span-2 sm:grid-cols-2">
      <legend className="flex items-center gap-1.5 px-1 text-sm font-medium"><UserRoundCog className="size-4 text-acento-600" /> Administrador de la empresa</legend>
      <Campo etiqueta="Nombre completo" error={errores.admin_nombre}><Entrada {...register('admin_nombre', { required: true })} /></Campo>
      <Campo etiqueta="Correo" error={errores.admin_email}><Entrada type="email" autoComplete="off" {...register('admin_email', { required: true })} /></Campo>
      <Campo etiqueta="Contraseña inicial" error={errores.admin_password} ayuda="Solo si el correo aún no tiene cuenta. Mínimo 8 caracteres." className="sm:col-span-2">
        <Entrada type="password" autoComplete="new-password" {...register('admin_password')} />
      </Campo>
    </fieldset>
  )
}

/** Alta de empresa (solo SuperAdmin): registrar una nueva en la API SUNAT o vincular una existente. */
export function NuevaEmpresa() {
  const [modo, setModo] = useState<'registrar' | 'vincular'>('vincular')
  const [advertencias, setAdvertencias] = useState<string[]>([])
  const [creada, setCreada] = useState<number | null>(null)
  const navegar = useNavigate()

  const terminar = async (r: RespuestaAlta) => {
    toast.success(`Empresa ${r.empresa.razon_social} lista.`)
    if (r.advertencias.length) {
      setCreada(r.empresa.id)
      setAdvertencias(r.advertencias)
    } else navegar(`/admin/empresas/${r.empresa.id}`)
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold">Nueva empresa</h1>
      <p className="mt-1 text-sm text-slate-500">Cada empresa usa sus propias credenciales del servicio de facturación SUNAT y tiene su propio Administrador.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {[
          { id: 'vincular' as const, titulo: 'Ya tengo credenciales', texto: 'La empresa ya está registrada en el servicio (api_key y api_secret).', icono: KeyRound },
          { id: 'registrar' as const, titulo: 'Registrar empresa nueva', texto: 'Con RUC, usuario SOL y certificado digital.', icono: Building2 },
        ].map((o) => (
          <button
            key={o.id}
            onClick={() => setModo(o.id)}
            className={cn('rounded-lg border bg-white p-4 text-left', modo === o.id ? 'border-acento-600 ring-2 ring-acento-100' : 'border-slate-200 hover:border-slate-300')}
          >
            <o.icono className="mb-2 size-5 text-acento-600" />
            <p className="font-medium">{o.titulo}</p>
            <p className="mt-0.5 text-sm text-slate-500">{o.texto}</p>
          </button>
        ))}
      </div>

      {advertencias.length > 0 ? (
        <Tarjeta className="mt-6" titulo="Empresa creada con observaciones">
          <ul className="flex flex-col gap-2 text-sm text-amber-800">
            {advertencias.map((a, i) => (
              <li key={i} className="flex gap-2"><TriangleAlert className="mt-0.5 size-4 shrink-0" /> {a}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-slate-500">El Administrador de la empresa puede completar sucursales y series desde Configuración.</p>
          <Boton className="mt-4" onClick={() => navegar(`/admin/empresas/${creada}`)}>Ver empresa</Boton>
        </Tarjeta>
      ) : (
        <div className="mt-6">{modo === 'vincular' ? <FormVincular alTerminar={terminar} /> : <FormRegistrar alTerminar={terminar} />}</div>
      )}

      {advertencias.length === 0 && (
        <Boton variante="fantasma" className="mt-4" onClick={() => navegar('/admin')}>Cancelar</Boton>
      )}
    </div>
  )
}

function FormVincular({ alTerminar }: { alTerminar: (r: RespuestaAlta) => Promise<void> }) {
  const { register, handleSubmit, formState } = useForm<Record<string, string>>()
  const { errores, capturar, limpiar } = useErroresCampo()
  const enviar = handleSubmit(async (d) => {
    limpiar()
    try {
      await alTerminar(await api.post<RespuestaAlta>('/admin/empresas/vincular', { ...d, admin_password: d.admin_password || undefined }))
    } catch (e) {
      capturar(e)
    }
  })
  return (
    <Tarjeta titulo="Vincular empresa existente">
      <form onSubmit={enviar} className="grid gap-4">
        <Campo etiqueta="API Key" error={errores.api_key}>
          <Entrada autoComplete="off" {...register('api_key', { required: true })} />
        </Campo>
        <Campo etiqueta="API Secret" error={errores.api_secret} ayuda="Se guarda cifrado. Nunca se vuelve a mostrar.">
          <Entrada type="password" autoComplete="off" {...register('api_secret', { required: true })} />
        </Campo>
        <CamposAdministrador register={register} errores={errores} />
        <Boton type="submit" cargando={formState.isSubmitting} className="justify-self-start">Vincular empresa</Boton>
      </form>
    </Tarjeta>
  )
}

function FormRegistrar({ alTerminar }: { alTerminar: (r: RespuestaAlta) => Promise<void> }) {
  const { register, handleSubmit, formState } = useForm<Record<string, string | FileList | undefined>>({ defaultValues: { entorno: 'beta', regimen: 'general' } })
  const { errores, capturar, limpiar } = useErroresCampo()
  const enviar = handleSubmit(async (d) => {
    limpiar()
    const form = new FormData()
    for (const [k, v] of Object.entries(d)) {
      if (v instanceof FileList) {
        if (v[0]) form.append(k, v[0])
      } else if (v) form.append(k, v)
    }
    try {
      await alTerminar(await api.post<RespuestaAlta>('/admin/empresas/registrar', form))
    } catch (e) {
      capturar(e)
    }
  })
  return (
    <Tarjeta titulo="Registrar empresa nueva" descripcion="Recomendado: primero en entorno de pruebas (beta).">
      <form onSubmit={enviar} className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="RUC" error={errores.ruc}><Entrada inputMode="numeric" maxLength={11} {...register('ruc', { required: true })} /></Campo>
        <Campo etiqueta="Razón social" error={errores.razon_social}><Entrada {...register('razon_social', { required: true })} /></Campo>
        <Campo etiqueta="Nombre comercial" className="sm:col-span-2"><Entrada {...register('nombre_comercial')} /></Campo>
        <Campo etiqueta="Dirección fiscal" error={errores.direccion} className="sm:col-span-2"><Entrada {...register('direccion', { required: true })} /></Campo>
        <Campo etiqueta="Ubigeo" error={errores.ubigeo} ayuda="6 dígitos (ej. 150101)"><Entrada inputMode="numeric" maxLength={6} {...register('ubigeo', { required: true })} /></Campo>
        <Campo etiqueta="Régimen tributario">
          <Selector {...register('regimen')}>
            <option value="general">General</option>
            <option value="mype">MYPE Tributario</option>
            <option value="rer">Especial (RER)</option>
            <option value="rus">Nuevo RUS (solo boletas)</option>
          </Selector>
        </Campo>
        <Campo etiqueta="Usuario SOL" error={errores.sol_user}><Entrada autoComplete="off" {...register('sol_user', { required: true })} /></Campo>
        <Campo etiqueta="Clave SOL" error={errores.sol_pass}><Entrada type="password" autoComplete="off" {...register('sol_pass', { required: true })} /></Campo>
        <Campo etiqueta="Certificado digital" error={errores.certificado} ayuda=".pfx, .p12, .pem, .cer o .crt (máx. 100 KB)">
          <Entrada type="file" accept=".pfx,.p12,.pem,.cer,.crt" className="py-1.5" {...register('certificado', { required: true })} />
        </Campo>
        <Campo etiqueta="Contraseña del certificado" ayuda="Obligatoria para .pfx / .p12"><Entrada type="password" {...register('contrasena_certificado')} /></Campo>
        <Campo etiqueta="Entorno">
          <Selector {...register('entorno')}>
            <option value="beta">Pruebas (beta)</option>
            <option value="production">Producción</option>
          </Selector>
        </Campo>
        <div />
        <Campo etiqueta="Client ID GRE (opcional)" ayuda="Necesario para guías de remisión"><Entrada {...register('gre_client_id')} /></Campo>
        <Campo etiqueta="Client Secret GRE (opcional)"><Entrada type="password" {...register('gre_client_secret')} /></Campo>
        <CamposAdministrador register={register} errores={errores} />
        <Boton type="submit" cargando={formState.isSubmitting} className="self-start sm:col-span-2 sm:justify-self-start">Registrar empresa</Boton>
      </form>
    </Tarjeta>
  )
}
