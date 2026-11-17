import env from '#start/env'
import { Encryption } from '@adonisjs/core/encryption'

/**
 * Cifra/descifra secretos en reposo (credenciales SUNAT por empresa).
 * Usa ENCRYPTION_KEY (distinta de APP_KEY) para poder rotarlas por separado.
 */
let encriptador: Encryption | null = null

function obtener(): Encryption {
  encriptador ??= new Encryption({ secret: env.get('ENCRYPTION_KEY') })
  return encriptador
}

export function cifrar(valor: string): string {
  return obtener().encrypt(valor)
}

export function descifrar(valorCifrado: string): string {
  const valor = obtener().decrypt<string>(valorCifrado)
  if (valor === null)
    throw new Error('No se pudo descifrar la credencial: ENCRYPTION_KEY incorrecta o dato dañado.')
  return valor
}
