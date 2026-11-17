import { readFile } from 'node:fs/promises'
import db from '@adonisjs/lucid/services/db'
import type { MultipartFile } from '@adonisjs/core/bodyparser'
import { SunatGateway } from '#integrations/sunat/sunat_service'
import type { CredencialesSunat } from '#integrations/sunat/sunat_client'
import { SunatApiError } from '#integrations/sunat/sunat_errors'
import { ReglaNegocioError } from '#exceptions/regla_negocio_error'
import { TIPO_DOCUMENTO, type TipoDocumento } from '#constants/sunat'
import { crearRolesPlantilla, habilitarPermisos } from '#services/permisos_service'
import { auditar } from '#services/auditoria_service'
import Almacen from '#models/almacen'
import Caja from '#models/caja'
import Empresa from '#models/empresa'
import Serie from '#models/serie'
import Sucursal from '#models/sucursal'
import Usuario from '#models/usuario'
import UsuarioEmpresaRol from '#models/usuario_empresa_rol'

export interface DatosRegistroEmpresa {
  ruc: string
  razonSocial: string
  nombreComercial?: string | null
  direccion: string
  ubigeo: string
  departamento?: string | null
  provincia?: string | null
  distrito?: string | null
  solUser: string
  solPass: string
  entorno: 'beta' | 'production'
  regimen: 'general' | 'mype' | 'rer' | 'rus'
  contrasenaCertificado?: string | null
  greClientId?: string | null
  greClientSecret?: string | null
}

/** Usuario que quedará como Administrador de la empresa. */
export interface AdministradorDestino {
  nombre: string
  email: string
  password?: string | null
}

/** Quién ejecuta la operación (para auditoría). */
export interface Actor {
  usuarioId: number
  ip?: string | null
}

/** Series que se crean por defecto en la sucursal principal. */
export const SERIES_POR_DEFECTO: Array<{ tipo: TipoDocumento; serie: string }> = [
  { tipo: TIPO_DOCUMENTO.FACTURA, serie: 'F001' },
  { tipo: TIPO_DOCUMENTO.BOLETA, serie: 'B001' },
  { tipo: TIPO_DOCUMENTO.NOTA_CREDITO, serie: 'FC01' },
  { tipo: TIPO_DOCUMENTO.NOTA_CREDITO, serie: 'BC01' },
  { tipo: TIPO_DOCUMENTO.NOTA_DEBITO, serie: 'FD01' },
  { tipo: TIPO_DOCUMENTO.NOTA_DEBITO, serie: 'BD01' },
  { tipo: TIPO_DOCUMENTO.GUIA_REMITENTE, serie: 'T001' },
]

interface DatosEmpresaApi {
  ruc: string
  razon_social: string
  nombre_comercial?: string | null
  direccion?: string | null
  ubigeo?: string | null
  departamento?: string | null
  provincia?: string | null
  distrito?: string | null
  entorno?: string | null
  tax_regime?: string | null
  id?: number | null
  tenant_id?: number | null
  client_id?: string | null
  tiene_client_secret?: boolean
  logo_url?: string | null
}

export class EmpresaService {
  /**
   * Alta de una empresa NUEVA en la API SUNAT (POST /registro) y en el sistema.
   * El api_secret se devuelve una sola vez: se guarda cifrado ANTES de cualquier otro paso.
   */
  async registrar(
    datos: DatosRegistroEmpresa,
    certificado: MultipartFile,
    administrador: AdministradorDestino,
    actor: Actor
  ) {
    await this.asegurarRucLibre(datos.ruc)
    await this.validarAdministrador(administrador)

    const formulario = new FormData()
    const campos: Record<string, string | null | undefined> = {
      ruc: datos.ruc,
      razon_social: datos.razonSocial,
      nombre_comercial: datos.nombreComercial,
      direccion: datos.direccion,
      ubigeo: datos.ubigeo,
      departamento: datos.departamento,
      provincia: datos.provincia,
      distrito: datos.distrito,
      sol_user: datos.solUser,
      sol_pass: datos.solPass,
      entorno: datos.entorno,
      tax_regime: datos.regimen,
      contrasena_certificado: datos.contrasenaCertificado,
      client_id: datos.greClientId,
      client_secret: datos.greClientSecret,
    }
    for (const [clave, valor] of Object.entries(campos)) {
      if (valor) formulario.append(clave, valor)
    }
    const contenido = await readFile(certificado.tmpPath!)
    formulario.append('certificado', new Blob([contenido]), certificado.clientName)

    const registro = await SunatGateway.cliente().registrarEmpresa(formulario)

    return this.crearEmpresaLocal(
      {
        ruc: datos.ruc,
        razon_social: datos.razonSocial,
        nombre_comercial: datos.nombreComercial,
        direccion: datos.direccion,
        ubigeo: datos.ubigeo,
        departamento: datos.departamento,
        provincia: datos.provincia,
        distrito: datos.distrito,
        entorno: datos.entorno,
        tax_regime: datos.regimen,
        tenant_id: registro.tenant_id,
        client_id: datos.greClientId,
        tiene_client_secret: Boolean(datos.greClientSecret),
      },
      { apiKey: registro.api_key, apiSecret: registro.api_secret },
      administrador,
      actor
    )
  }

  /**
   * Vincula una empresa YA registrada en la API (el RUC es único allí) usando sus credenciales.
   */
  async vincular(
    credenciales: CredencialesSunat,
    administrador: AdministradorDestino,
    actor: Actor
  ) {
    await this.validarAdministrador(administrador)
    let datosApi: DatosEmpresaApi
    try {
      datosApi = (await SunatGateway.cliente().obtenerEmpresa(credenciales)) as DatosEmpresaApi
    } catch (error) {
      if (error instanceof SunatApiError && error.status === 401) {
        throw new ReglaNegocioError('El api_key o api_secret no son válidos.', [
          { campo: 'api_key', mensaje: 'Credenciales rechazadas por el servicio de facturación.' },
        ])
      }
      throw error
    }
    await this.asegurarRucLibre(datosApi.ruc)
    return this.crearEmpresaLocal(datosApi, credenciales, administrador, actor)
  }

  /** Falla antes de tocar la API SUNAT si el Administrador indicado no se puede crear. */
  private async validarAdministrador(administrador: AdministradorDestino) {
    const existente = await Usuario.findBy('email', administrador.email)
    if (existente?.esSuperadmin) {
      throw new ReglaNegocioError('El SuperAdmin no puede ser Administrador de una empresa.', [
        { campo: 'admin_email', mensaje: 'Use otro correo.' },
      ])
    }
    if (!existente && !administrador.password) {
      throw new ReglaNegocioError('Indique una contraseña inicial para el Administrador.', [
        { campo: 'admin_password', mensaje: 'Requerida para usuarios nuevos.' },
      ])
    }
  }

  private async asegurarRucLibre(ruc: string) {
    const existente = await Empresa.findBy('ruc', ruc)
    if (existente) {
      throw new ReglaNegocioError(
        'Esta empresa ya existe en la plataforma. Adminístrela desde su ficha.',
        [{ campo: 'ruc', mensaje: 'RUC ya registrado.' }]
      )
    }
  }

  private async crearEmpresaLocal(
    datos: DatosEmpresaApi,
    credenciales: CredencialesSunat,
    administrador: AdministradorDestino,
    actor: Actor
  ) {
    // 1) Paso crítico y atómico: empresa + credenciales cifradas + roles + membresía de Administrador
    const empresa = await db.transaction(async (trx) => {
      const nueva = new Empresa()
      nueva.useTransaction(trx)
      nueva.merge({
        ruc: datos.ruc,
        razonSocial: datos.razon_social,
        nombreComercial: datos.nombre_comercial ?? null,
        direccion: datos.direccion ?? '-',
        ubigeo: datos.ubigeo ?? '150101',
        departamento: datos.departamento ?? null,
        provincia: datos.provincia ?? null,
        distrito: datos.distrito ?? null,
        regimen: (datos.tax_regime as Empresa['regimen']) ?? 'general',
        entorno: datos.entorno === 'production' ? 'production' : 'beta',
        sunatTenantId: datos.tenant_id ?? datos.id ?? null,
        greConfigurada: Boolean(datos.client_id && datos.tiene_client_secret),
        logoUrl: datos.logo_url ?? null,
        formatoImpresion: 'a4',
        permitirVentaSinStock: false,
        igvTasa: 0.18,
        activo: true,
      })
      nueva.establecerCredenciales(credenciales.apiKey, credenciales.apiSecret)
      await nueva.save()

      let usuario = await Usuario.query({ client: trx }).where('email', administrador.email).first()
      if (!usuario) {
        usuario = await Usuario.create(
          {
            nombreCompleto: administrador.nombre,
            email: administrador.email,
            password: administrador.password!,
            activo: true,
          },
          { client: trx }
        )
      }

      await habilitarPermisos(nueva.id, undefined, trx)
      const rolAdmin = await crearRolesPlantilla(nueva.id, trx)
      await UsuarioEmpresaRol.create(
        { usuarioId: usuario.id, empresaId: nueva.id, rolId: rolAdmin.id, activo: true },
        { client: trx }
      )
      if (!usuario.empresaPredeterminadaId) {
        usuario.useTransaction(trx)
        usuario.empresaPredeterminadaId = nueva.id
        await usuario.save()
      }
      await auditar(
        {
          empresaId: nueva.id,
          usuarioId: actor.usuarioId,
          accion: 'empresa.alta',
          entidad: 'empresa',
          entidadId: nueva.id,
          despues: { ruc: nueva.ruc, administrador: administrador.email },
          ip: actor.ip ?? null,
        },
        trx
      )
      return nueva
    })

    // 2) Estructura inicial (sucursal, almacén, caja, series). Si algo falla aquí, la empresa
    //    ya quedó guardada con sus credenciales y se puede completar desde Configuración.
    const advertencias = await this.prepararEstructuraInicial(empresa)
    return { empresa, advertencias }
  }

  /** Crea sucursal principal, almacén, caja y series por defecto, sincronizando con la API. */
  async prepararEstructuraInicial(empresa: Empresa): Promise<string[]> {
    const advertencias: string[] = []
    const cliente = SunatGateway.cliente()
    const cred = empresa.credenciales()

    let sunatSucursalId: number | null = null
    let codLocal = '0000'
    try {
      const remotas = await cliente.listarSucursales(cred)
      const principal = remotas.find((s) => s.es_principal) ?? remotas[0]
      if (principal) {
        sunatSucursalId = principal.id
        codLocal = principal.cod_local
      } else {
        const creada = await cliente.crearSucursal(cred, {
          nombre: 'Principal',
          cod_local: codLocal,
          direccion: empresa.direccion,
          ubigeo: empresa.ubigeo,
        })
        sunatSucursalId = creada.id
      }
    } catch (error) {
      advertencias.push(`No se pudo sincronizar la sucursal con SUNAT: ${(error as Error).message}`)
    }

    const sucursal = await Sucursal.create({
      empresaId: empresa.id,
      nombre: 'Principal',
      codLocal,
      direccion: empresa.direccion,
      ubigeo: empresa.ubigeo,
      sunatSucursalId,
      esPrincipal: true,
      activo: true,
    })
    await Almacen.create({
      empresaId: empresa.id,
      sucursalId: sucursal.id,
      nombre: 'Almacén principal',
      activo: true,
    })
    await Caja.create({
      empresaId: empresa.id,
      sucursalId: sucursal.id,
      nombre: 'Caja 1',
      activo: true,
    })

    for (const { tipo, serie } of SERIES_POR_DEFECTO) {
      try {
        const resultado = await cliente.crearSerie(cred, {
          tipoDocumento: tipo,
          serie,
          sunatSucursalId,
        })
        const creada = resultado.creadas?.[0]
        await Serie.create({
          empresaId: empresa.id,
          sucursalId: sucursal.id,
          tipoDocumento: tipo,
          serie,
          sunatSerieId: creada?.id ?? null,
          activo: true,
        })
        if (resultado.errores?.length) advertencias.push(...resultado.errores)
      } catch (error) {
        // 422 = la serie ya existe en la API (p. ej. creada en el registro): se refleja localmente igual
        if (error instanceof SunatApiError && error.status === 422) {
          await Serie.create({
            empresaId: empresa.id,
            sucursalId: sucursal.id,
            tipoDocumento: tipo,
            serie,
            sunatSerieId: null,
            activo: true,
          })
        }
        advertencias.push(`Serie ${serie}: ${(error as Error).message}`)
      }
    }
    return advertencias
  }
}
