import { configApp } from '@adonisjs/eslint-config'

export default configApp({
  // En las pruebas se encadena `(await client.get(...)).assertStatus(...)` a propósito
  files: ['tests/**/*.ts'],
  rules: { '@unicorn/no-await-expression-member': 'off' },
})
