import db from '@adonisjs/lucid/services/db'
import Empresa from '#models/empresa'
import Rol from '#models/rol'
import Serie from '#models/serie'
import Sucursal from '#models/sucursal'
import Usuario from '#models/usuario'
import Almacen from '#models/almacen'
import Caja from '#models/caja'
import Producto from '#models/producto'
import Proveedor from '#models/proveedor'
import Cliente from '#models/cliente'
import UsuarioEmpresaRol from '#models/usuario_empresa_rol'
import { crearRolesPlantilla } from '#services/permisos_service'
import { SunatClient } from '#integrations/sunat/sunat_client'
import { SunatGateway } from '#integrations/sunat/sunat_service'

/** Respuesta HTTP simulada de la API SUNAT. */
export interface RespuestaFalsa {
  status?: number
  cuerpo?: unknown
  binario?: string
  error?: Error
}

/**
 * API SUNAT falsa: responde según la ruta "METODO /ruta" y registra cada llamada.
 * Si una ruta tiene una lista de respuestas, las entrega en orden.
 */
export class SunatFalsa {
  llamadas: Array<{ metodo: string; ruta: string; headers: Record<string, string>; cuerpo: any }> =
    []
  private rutas = new Map<string, RespuestaFalsa[]>()

  cuando(clave: string, ...respuestas: RespuestaFalsa[]) {
    this.rutas.set(clave, respuestas)
    return this
  }

  fetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const u = new URL(String(url))
    const ruta = u.pathname.replace('/api/v1', '')
    const metodo = init?.method ?? 'GET'
    const cuerpo = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body
    this.llamadas.push({
      metodo,
      ruta: `${ruta}${u.search}`,
      headers: (init?.headers ?? {}) as Record<string, string>,
      cuerpo,
    })

    const lista = this.rutas.get(`${metodo} ${ruta}`)
    const respuesta = lista && lista.length > 1 ? lista.shift()! : lista?.[0]
    if (!respuesta)
      return new Response(
        JSON.stringify({ estado: 'error', mensaje: `Ruta no simulada ${metodo} ${ruta}` }),
        { status: 404 }
      )
    if (respuesta.error) throw respuesta.error
    if (respuesta.binario !== undefined) {
      return new Response(respuesta.binario, {
        status: respuesta.status ?? 200,
        headers: { 'content-type': 'application/pdf' },
      })
    }
    return new Response(JSON.stringify(respuesta.cuerpo ?? {}), { status: respuesta.status ?? 200 })
  }

  instalar() {
    SunatGateway.usar(
      new SunatClient({
        baseUrl: 'http://sunat.falsa/api/v1',
        fetchImpl: this.fetch as any,
        esperar: async () => {},
        backoffMs: 1,
      })
    )
    return this
  }
}

export const exito = (datos: unknown, status = 200): RespuestaFalsa => ({
  status,
  cuerpo: { estado: 'exito', mensaje: 'ok', datos },
})

let secuencia = 0

export async function crearUsuario(datos: Partial<{ email: string; nombreCompleto: string }> = {}) {
  secuencia++
  return Usuario.create({
    nombreCompleto: datos.nombreCompleto ?? `Usuario Prueba ${secuencia}`,
    email: datos.email ?? `usuario${secuencia}-${Date.now()}@prueba.pe`,
    password: 'clave-segura-123',
    activo: true,
  })
}

/** Empresa de prueba con roles plantilla, sucursal, series F001/B001 y un Administrador. */
export async function crearEmpresa(
  admin: Usuario,
  datos: Partial<{ ruc: string; regimen: Empresa['regimen'] }> = {}
) {
  secuencia++
  return db.transaction(async (trx) => {
    const empresa = new Empresa()
    empresa.useTransaction(trx)
    empresa.merge({
      ruc: datos.ruc ?? `20${String(100000000 + secuencia * 7919).slice(0, 9)}`,
      razonSocial: `Empresa Prueba ${secuencia} SAC`,
      direccion: 'Av. Prueba 123',
      ubigeo: '150101',
      regimen: datos.regimen ?? 'general',
      entorno: 'beta',
      greConfigurada: false,
      formatoImpresion: 'a4',
      permitirVentaSinStock: false,
      igvTasa: 0.18,
      activo: true,
    })
    empresa.establecerCredenciales(`key-${secuencia}-abcdefgh`, `secret-${secuencia}-abcdefgh`)
    await empresa.save()
    const administrador = await crearRolesPlantilla(empresa.id, trx)
    await UsuarioEmpresaRol.create(
      { usuarioId: admin.id, empresaId: empresa.id, rolId: administrador.id, activo: true },
      { client: trx }
    )
    const sucursal = await Sucursal.create(
      {
        empresaId: empresa.id,
        nombre: 'Principal',
        codLocal: '0000',
        direccion: 'Av. Prueba 123',
        ubigeo: '150101',
        esPrincipal: true,
        activo: true,
        sunatSucursalId: 1,
      },
      { client: trx }
    )
    const series: Array<[string, string]> = [
      ['01', 'F001'],
      ['03', 'B001'],
      ['07', 'FC01'],
      ['07', 'BC01'],
      ['08', 'FD01'],
      ['09', 'T001'],
    ]
    await Serie.createMany(
      series.map(([tipoDocumento, serie]) => ({
        empresaId: empresa.id,
        sucursalId: sucursal.id,
        tipoDocumento: tipoDocumento as any,
        serie,
        activo: true,
      })),
      { client: trx }
    )
    await Almacen.create(
      { empresaId: empresa.id, sucursalId: sucursal.id, nombre: 'Almacén principal', activo: true },
      { client: trx }
    )
    await Caja.create(
      { empresaId: empresa.id, sucursalId: sucursal.id, nombre: 'Caja 1', activo: true },
      { client: trx }
    )
    return empresa
  })
}

export async function asignarRol(usuario: Usuario, empresa: Empresa, nombreRol: string) {
  const rol = await Rol.query().where({ empresaId: empresa.id, nombre: nombreRol }).firstOrFail()
  return UsuarioEmpresaRol.create({
    usuarioId: usuario.id,
    empresaId: empresa.id,
    rolId: rol.id,
    activo: true,
  })
}

/** Respuesta típica de la API al emitir un comprobante. */
export function comprobanteApi(parcial: Record<string, any> = {}) {
  return {
    id: 501,
    tipo_documento: '03',
    serie: 'B001',
    correlativo: 1,
    numero_completo: 'B001-1',
    totales: { gravadas: 8.47, igv: 1.53, total: 10 },
    sunat: {
      estado: 'aceptado',
      codigo: '0',
      descripcion: 'La Boleta numero B001-1, ha sido aceptada',
      notas: [],
      hash_cpe: 'abc123',
    },
    ...parcial,
  }
}

export const boletaValida = {
  tipo_documento: '03',
  moneda: 'PEN',
  forma_pago: 'Contado',
  cliente: { tipo_doc: '0', num_doc: '00000000', razon_social: 'CLIENTES VARIOS' },
  items: [
    {
      codigo: 'P001',
      descripcion: 'Producto',
      unidad: 'NIU',
      cantidad: 2,
      precio_unitario: 5,
      tip_afe_igv: '10',
    },
  ],
}

/** Datos base de inventario para pruebas: almacén, caja, producto con/sin stock, proveedor y cliente. */
export async function datosInventario(empresa: Empresa) {
  const almacen = await Almacen.query().where('empresa_id', empresa.id).firstOrFail()
  const caja = await Caja.query().where('empresa_id', empresa.id).firstOrFail()
  const producto = await Producto.create({
    empresaId: empresa.id,
    codigo: `P${++secuencia}`,
    nombre: 'Arroz 5kg',
    unidad: 'NIU',
    tipAfeIgv: '10',
    controlaStock: true,
    precioVenta: 23.6,
    stockMinimo: 2,
    activo: true,
  })
  const servicio = await Producto.create({
    empresaId: empresa.id,
    codigo: `S${++secuencia}`,
    nombre: 'Delivery',
    unidad: 'ZZ',
    tipAfeIgv: '10',
    controlaStock: false,
    precioVenta: 5.9,
    stockMinimo: 0,
    activo: true,
  })
  const proveedor = await Proveedor.create({
    empresaId: empresa.id,
    tipoDoc: '6',
    numDoc: '20100070970',
    razonSocial: 'DISTRIBUIDORA SAC',
    activo: true,
  })
  const cliente = await Cliente.create({
    empresaId: empresa.id,
    tipoDoc: '6',
    numDoc: '20512345678',
    razonSocial: 'ACME SAC',
    direccion: 'Av. Lima 1',
    activo: true,
  })
  return { almacen, caja, producto, servicio, proveedor, cliente }
}

/** N respuestas de emisión con ids/correlativos distintos (para varias ventas en una prueba). */
export function emisiones(n: number, serie = 'B001', tipo = '03') {
  return Array.from({ length: n }, (_, i) =>
    exito(
      comprobanteApi({
        id: 600 + i,
        tipo_documento: tipo,
        serie,
        correlativo: i + 1,
        numero_completo: `${serie}-${i + 1}`,
      }),
      201
    )
  )
}
