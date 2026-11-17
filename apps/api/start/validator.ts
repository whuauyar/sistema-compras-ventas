/*
| Mensajes de validación en español (VineJS)
*/
import vine, { SimpleMessagesProvider } from '@vinejs/vine'

vine.messagesProvider = new SimpleMessagesProvider({
  'required': 'El campo {{ field }} es obligatorio.',
  'string': 'El campo {{ field }} debe ser texto.',
  'number': 'El campo {{ field }} debe ser numérico.',
  'boolean': 'El campo {{ field }} debe ser verdadero o falso.',
  'email': 'El campo {{ field }} debe ser un correo válido.',
  'minLength': 'El campo {{ field }} debe tener al menos {{ min }} caracteres.',
  'maxLength': 'El campo {{ field }} no puede superar {{ max }} caracteres.',
  'regex': 'El formato de {{ field }} no es válido.',
  'enum': 'El valor de {{ field }} no es válido.',
  'positive': 'El campo {{ field }} debe ser mayor a 0.',
  'min': 'El campo {{ field }} debe ser al menos {{ min }}.',
  'range': 'El campo {{ field }} debe estar entre {{ min }} y {{ max }}.',
  'array': 'El campo {{ field }} debe ser una lista.',
  'array.minLength': 'Debe agregar al menos {{ min }} elemento(s) en {{ field }}.',
  'distinct': 'El campo {{ field }} tiene valores repetidos.',
  'confirmed': 'La confirmación no coincide.',
  'date': 'El campo {{ field }} debe ser una fecha válida.',
  'file.size': 'El archivo {{ field }} no puede superar {{ size }}.',
  'file.extname': 'El archivo {{ field }} debe ser de tipo {{ extnames }}.',
  'file': 'El campo {{ field }} debe ser un archivo.',
})
