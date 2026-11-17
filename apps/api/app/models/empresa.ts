import { DateTime } from 'luxon'
import { BaseModel, column, hasMany, manyToMany } from '@adonisjs/lucid/orm'
import type { HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import type { FormatoImpresion } from '#constants/sunat'
import { cifrar, descifrar } from '#services/cifrado_service'
import type { CredencialesSunat } from '#integrations/sunat/sunat_client'
import Sucursal from '#models/sucursal'
import Permiso from '#models/permiso'

/** Empresa = tenant de la API SUNAT. Sus credenciales viven cifradas y nunca se serializan. */
export default class Empresa extends BaseModel {
  static table = 'empresas'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare ruc: string

  @column()
  declare razonSocial: string

  @column()
  declare nombreComercial: string | null

  @column()
  declare direccion: string

  @column()
  declare ubigeo: string

  @column()
  declare departamento: string | null

  @column()
  declare provincia: string | null

  @column()
  declare distrito: string | null

  @column()
  declare regimen: 'general' | 'mype' | 'rer' | 'rus'

  @column()
  declare entorno: 'beta' | 'production'

  @column()
  declare sunatTenantId: number | null

  @column({ serializeAs: null })
  declare sunatApiKeyCifrada: string

  @column({ serializeAs: null })
  declare sunatApiSecretCifrada: string

  @column()
  declare greConfigurada: boolean

  @column()
  declare logoUrl: string | null

  @column()
  declare formatoImpresion: FormatoImpresion

  @column()
  declare permitirVentaSinStock: boolean

  @column({ consume: (v) => Number(v) })
  declare igvTasa: number

  @column()
  declare activo: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @hasMany(() => Sucursal)
  declare sucursales: HasMany<typeof Sucursal>

  /** Tope de permisos que la empresa puede usar (definido por el SuperAdmin). */
  @manyToMany(() => Permiso, {
    pivotTable: 'empresa_permiso',
    pivotForeignKey: 'empresa_id',
    pivotRelatedForeignKey: 'permiso_id',
  })
  declare permisosHabilitados: ManyToMany<typeof Permiso>

  establecerCredenciales(apiKey: string, apiSecret: string) {
    this.sunatApiKeyCifrada = cifrar(apiKey)
    this.sunatApiSecretCifrada = cifrar(apiSecret)
  }

  credenciales(): CredencialesSunat {
    return {
      apiKey: descifrar(this.sunatApiKeyCifrada),
      apiSecret: descifrar(this.sunatApiSecretCifrada),
    }
  }

  /** api_key enmascarada para mostrar en pantalla (el secret nunca se muestra). */
  apiKeyEnmascarada(): string {
    const clave = descifrar(this.sunatApiKeyCifrada)
    return clave.length <= 8 ? '••••' : `${clave.slice(0, 4)}••••${clave.slice(-4)}`
  }
}
