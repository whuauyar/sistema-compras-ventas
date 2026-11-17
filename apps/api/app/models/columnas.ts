/** Convierte numeric de PostgreSQL (string) a number al leer. */
export const aNumero = (v: unknown) => (v === null || v === undefined ? v : Number(v))

/**
 * jsonb: node-postgres envía los arrays de JS como arrays de PostgreSQL ('{...}'),
 * no como JSON. Se serializa explícitamente para que arrays y objetos se guarden bien.
 */
export const aJson = (v: unknown) => (v === null || v === undefined ? v : JSON.stringify(v))
