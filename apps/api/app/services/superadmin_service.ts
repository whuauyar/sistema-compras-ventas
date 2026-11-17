import Usuario from '#models/usuario'

export interface DatosSuperadmin {
  email?: string
  password?: string
  nombre?: string
  /** Si es true y el usuario existe, se le asigna `password` (reinicio controlado). */
  reset?: boolean
}

/**
 * Asegura que exista el SuperAdmin indicado por variables de entorno.
 * - Si el correo no existe, lo crea (requiere contraseña).
 * - Si existe, solo lo marca como SuperAdmin: NO cambia su contraseña,
 *   salvo reinicio controlado (`reset`): entonces aplica `password` y cierra sus sesiones.
 * Devuelve qué hizo, para el log del despliegue.
 */
export async function asegurarSuperadmin(
  datos: DatosSuperadmin
): Promise<
  'omitido' | 'sin_password' | 'creado' | 'promovido' | 'existente' | 'clave_restablecida'
> {
  const email = datos.email?.trim().toLowerCase()
  if (!email) return 'omitido'
  const claveValida = Boolean(datos.password && datos.password.length >= 12)

  const existente = await Usuario.findBy('email', email)
  if (existente && datos.reset) {
    if (!claveValida) return 'sin_password'
    existente.merge({ password: datos.password!, esSuperadmin: true, activo: true })
    await existente.save()
    // Las sesiones abiertas con la clave anterior dejan de valer
    const tokens = await Usuario.accessTokens.all(existente)
    for (const t of tokens) await Usuario.accessTokens.delete(existente, t.identifier)
    return 'clave_restablecida'
  }
  if (existente) {
    if (existente.esSuperadmin && existente.activo) return 'existente'
    existente.merge({ esSuperadmin: true, activo: true })
    await existente.save()
    return 'promovido'
  }
  if (!claveValida) return 'sin_password'
  await Usuario.create({
    nombreCompleto: datos.nombre?.trim() || 'SuperAdmin',
    email,
    password: datos.password,
    activo: true,
    esSuperadmin: true,
  })
  return 'creado'
}
