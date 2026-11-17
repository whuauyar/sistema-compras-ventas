import Usuario from '#models/usuario'

export interface DatosSuperadmin {
  email?: string
  password?: string
  nombre?: string
}

/**
 * Asegura que exista el SuperAdmin indicado por variables de entorno.
 * - Si el correo no existe, lo crea (requiere contraseña).
 * - Si existe, solo lo marca como SuperAdmin: NO cambia su contraseña.
 * Devuelve qué hizo, para el log del despliegue.
 */
export async function asegurarSuperadmin(
  datos: DatosSuperadmin
): Promise<'omitido' | 'sin_password' | 'creado' | 'promovido' | 'existente'> {
  const email = datos.email?.trim().toLowerCase()
  if (!email) return 'omitido'

  const existente = await Usuario.findBy('email', email)
  if (existente) {
    if (existente.esSuperadmin && existente.activo) return 'existente'
    existente.merge({ esSuperadmin: true, activo: true })
    await existente.save()
    return 'promovido'
  }
  if (!datos.password || datos.password.length < 12) return 'sin_password'
  await Usuario.create({
    nombreCompleto: datos.nombre?.trim() || 'SuperAdmin',
    email,
    password: datos.password,
    activo: true,
    esSuperadmin: true,
  })
  return 'creado'
}
