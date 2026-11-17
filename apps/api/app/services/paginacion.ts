/** Ejecuta una consulta paginada y devuelve { meta, data } listo para JSON. */
export async function paginar(
  consulta: {
    paginate: (
      pagina: number,
      porPagina: number
    ) => Promise<{ toJSON: () => { meta: any; data: any[] } }>
  },
  pagina: number,
  porPagina: number
) {
  const resultado = await consulta.paginate(pagina, porPagina)
  return resultado.toJSON()
}
