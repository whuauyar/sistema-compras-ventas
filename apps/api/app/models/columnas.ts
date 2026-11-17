/** Convierte numeric de PostgreSQL (string) a number al leer. */
export const aNumero = (v: unknown) => (v === null || v === undefined ? v : Number(v))
