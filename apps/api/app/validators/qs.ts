/**
 * El parser de query string de Adonis convierte "a,b" en ['a','b'].
 * Para los filtros se vuelve a unir en texto ("a,b") y los validadores reciben siempre strings.
 */
export function qsPlano(qs: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(qs).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v])
  )
}
