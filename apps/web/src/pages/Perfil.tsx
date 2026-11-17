import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { api, mensajeError } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { FORMATOS } from '@/lib/sunat'
import { Boton, Campo, Encabezado, Entrada, Selector, Tarjeta } from '@/components/ui'

/** Configurador de Perfil. */
export function Perfil() {
  const { usuario, empresas, recargar } = useSesion()
  const datos = useForm<{ nombre_completo: string; telefono: string; formato_impresion: string; empresa_predeterminada_id: string }>()
  const clave = useForm<{ password_actual: string; password: string; password_confirmacion: string }>()

  useEffect(() => {
    if (usuario)
      datos.reset({
        nombre_completo: usuario.nombre_completo,
        telefono: usuario.telefono ?? '',
        formato_impresion: usuario.formato_impresion ?? '',
        empresa_predeterminada_id: usuario.empresa_predeterminada_id ? String(usuario.empresa_predeterminada_id) : '',
      })
  }, [usuario, datos])

  const guardar = datos.handleSubmit(async (d) => {
    try {
      await api.put('/perfil', {
        nombre_completo: d.nombre_completo,
        telefono: d.telefono || null,
        formato_impresion: d.formato_impresion || null,
        empresa_predeterminada_id: d.empresa_predeterminada_id ? Number(d.empresa_predeterminada_id) : null,
      })
      await recargar()
      toast.success('Perfil actualizado.')
    } catch (e) {
      toast.error(mensajeError(e))
    }
  })

  const cambiar = clave.handleSubmit(async (d) => {
    try {
      await api.put('/perfil/password', d)
      clave.reset()
      toast.success('Contraseña actualizada.')
    } catch (e) {
      toast.error(mensajeError(e))
    }
  })

  return (
    <>
      <Encabezado titulo="Mi perfil" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Tarjeta titulo="Datos y preferencias">
          <form onSubmit={guardar} className="flex flex-col gap-4">
            <Campo etiqueta="Correo"><Entrada value={usuario?.email ?? ''} disabled /></Campo>
            <Campo etiqueta="Nombre completo"><Entrada {...datos.register('nombre_completo', { required: true })} /></Campo>
            <Campo etiqueta="Teléfono"><Entrada {...datos.register('telefono')} /></Campo>
            <Campo etiqueta="Mi formato de impresión" ayuda="Tiene prioridad sobre el de la caja, sucursal y empresa.">
              <Selector {...datos.register('formato_impresion')}><option value="">Usar el de la caja/sucursal/empresa</option>{FORMATOS.map((f) => <option key={f.valor} value={f.valor}>{f.etiqueta}</option>)}</Selector>
            </Campo>
            <Campo etiqueta="Empresa al ingresar">
              <Selector {...datos.register('empresa_predeterminada_id')}><option value="">La última usada</option>{empresas.map((e) => <option key={e.id} value={e.id}>{e.razon_social}</option>)}</Selector>
            </Campo>
            <Boton type="submit" cargando={datos.formState.isSubmitting} className="self-start">Guardar</Boton>
          </form>
        </Tarjeta>
        <Tarjeta titulo="Cambiar contraseña">
          <form onSubmit={cambiar} className="flex flex-col gap-4">
            <Campo etiqueta="Contraseña actual"><Entrada type="password" autoComplete="current-password" {...clave.register('password_actual', { required: true })} /></Campo>
            <Campo etiqueta="Nueva contraseña" ayuda="Mínimo 8 caracteres."><Entrada type="password" autoComplete="new-password" {...clave.register('password', { required: true, minLength: 8 })} /></Campo>
            <Campo etiqueta="Confirmar nueva contraseña"><Entrada type="password" autoComplete="new-password" {...clave.register('password_confirmacion', { required: true })} /></Campo>
            <Boton type="submit" cargando={clave.formState.isSubmitting} className="self-start">Cambiar contraseña</Boton>
          </form>
        </Tarjeta>
      </div>
    </>
  )
}
