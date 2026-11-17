import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column, hasMany, manyToMany } from '@adonisjs/lucid/orm'
import type { HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import type { FormatoImpresion } from '#constants/sunat'
import UsuarioEmpresaRol from '#models/usuario_empresa_rol'
import Sucursal from '#models/sucursal'

const AuthFinder = withAuthFinder(() => hash.use('scrypt'), {
  uids: ['email'],
  passwordColumnName: 'password',
})

/** Usuario = Perfil (datos personales). Sus roles van por empresa en usuario_empresa_rol. */
export default class Usuario extends compose(BaseModel, AuthFinder) {
  static table = 'usuarios'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare nombreCompleto: string

  @column()
  declare email: string

  @column({ serializeAs: null })
  declare password: string

  @column()
  declare telefono: string | null

  @column()
  declare avatarUrl: string | null

  @column()
  declare empresaPredeterminadaId: number | null

  @column()
  declare formatoImpresion: FormatoImpresion | null

  @column()
  declare activo: boolean

  @column.dateTime()
  declare ultimoAccesoEn: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @hasMany(() => UsuarioEmpresaRol)
  declare membresias: HasMany<typeof UsuarioEmpresaRol>

  @manyToMany(() => Sucursal, { pivotTable: 'usuario_sucursal' })
  declare sucursales: ManyToMany<typeof Sucursal>

  static accessTokens = DbAccessTokensProvider.forModel(Usuario, {
    expiresIn: '12 hours',
    prefix: 'scv_',
  })
}
