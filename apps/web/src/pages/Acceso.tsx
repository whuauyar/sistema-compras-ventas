import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useSesion } from '@/lib/sesion'
import { ApiError, mensajeError } from '@/lib/api'
import { Boton, Campo, Entrada } from '@/components/ui'

function Marco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-full place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2 font-semibold text-slate-900">
          <span className="grid size-8 place-items-center rounded-md bg-acento-600 text-xs text-white">CV</span>
          Compras y Ventas
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h1 className="mb-5 text-lg font-semibold">{titulo}</h1>
          {children}
        </div>
      </div>
    </div>
  )
}

const esquemaLogin = z.object({ email: z.string().email('Correo no válido'), password: z.string().min(1, 'Ingrese su contraseña') })

export function Login() {
  const { ingresar } = useSesion()
  const navegar = useNavigate()
  const { register, handleSubmit, formState } = useForm<z.infer<typeof esquemaLogin>>({ resolver: zodResolver(esquemaLogin) })
  const enviar = handleSubmit(async (d) => {
    try {
      await ingresar(d.email, d.password)
      navegar('/')
    } catch (e) {
      toast.error(e instanceof ApiError && e.status === 400 ? 'Correo o contraseña incorrectos.' : mensajeError(e))
    }
  })
  return (
    <Marco titulo="Iniciar sesión">
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <Campo etiqueta="Correo" error={formState.errors.email?.message}>
          <Entrada type="email" autoComplete="email" autoFocus {...register('email')} />
        </Campo>
        <Campo etiqueta="Contraseña" error={formState.errors.password?.message}>
          <Entrada type="password" autoComplete="current-password" {...register('password')} />
        </Campo>
        <Boton type="submit" cargando={formState.isSubmitting}>Ingresar</Boton>
        <p className="text-center text-sm text-slate-500">
          ¿No tiene cuenta? <Link to="/registro" className="font-medium text-acento-700">Crear cuenta</Link>
        </p>
      </form>
    </Marco>
  )
}

const esquemaRegistro = z
  .object({
    nombre_completo: z.string().min(3, 'Mínimo 3 caracteres'),
    email: z.string().email('Correo no válido'),
    password: z.string().min(8, 'Mínimo 8 caracteres'),
    confirmar: z.string(),
  })
  .refine((d) => d.password === d.confirmar, { path: ['confirmar'], message: 'No coincide' })

export function Registro() {
  const { registrarse } = useSesion()
  const navegar = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState } = useForm<z.infer<typeof esquemaRegistro>>({ resolver: zodResolver(esquemaRegistro) })
  const enviar = handleSubmit(async ({ nombre_completo, email, password }) => {
    const d = { nombre_completo, email, password }
    try {
      await registrarse(d)
      navegar('/empresas/nueva')
    } catch (e) {
      setError(mensajeError(e))
    }
  })
  return (
    <Marco titulo="Crear cuenta">
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <Campo etiqueta="Nombre completo" error={formState.errors.nombre_completo?.message}>
          <Entrada autoFocus {...register('nombre_completo')} />
        </Campo>
        <Campo etiqueta="Correo" error={formState.errors.email?.message}>
          <Entrada type="email" {...register('email')} />
        </Campo>
        <Campo etiqueta="Contraseña" error={formState.errors.password?.message}>
          <Entrada type="password" autoComplete="new-password" {...register('password')} />
        </Campo>
        <Campo etiqueta="Confirmar contraseña" error={formState.errors.confirmar?.message}>
          <Entrada type="password" autoComplete="new-password" {...register('confirmar')} />
        </Campo>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <Boton type="submit" cargando={formState.isSubmitting}>Crear cuenta</Boton>
        <p className="text-center text-sm text-slate-500">
          ¿Ya tiene cuenta? <Link to="/login" className="font-medium text-acento-700">Ingresar</Link>
        </p>
      </form>
    </Marco>
  )
}
