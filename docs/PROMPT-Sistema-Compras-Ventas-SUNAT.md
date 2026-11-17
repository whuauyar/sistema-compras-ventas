# PROMPT — Sistema estándar de Compras y Ventas con Facturación Electrónica SUNAT

> Copia este archivo completo en tu asistente de IA (Claude Code, Cursor, etc.).
> Stack **fijo**: React (frontend responsive) + AdonisJS (backend) + PostgreSQL, desplegado en Railway.
> Facturación electrónica **consumida** desde la API `https://github.com/whuauyar/plataform-api-sunat` (no se reconstruye).

---

## 0) Reglas de trabajo para la IA (obligatorias)

1. **No escribas código todavía.** Primero:
   - Lee del repo `whuauyar/plataform-api-sunat` estos archivos y trátalos como **fuente de verdad** del contrato:
     `PROMPT-Integrar-Facturacion-SUNAT.md` (secciones 6, 7, 12 y 13), `routes/api.php`, `.env.example`
     y la colección Postman. **No inventes endpoints ni campos**; si algo no está ahí, pregúntame.
   - Hazme solo estas preguntas, como opciones seleccionables (a, b, c…), y espera respuesta:
     1. ¿Control de stock? (a) Sí, con kardex valorizado (costo promedio) · (b) Sí, solo cantidades · (c) No
     2. ¿Ventas a crédito con cuotas y cuentas por cobrar? (a) Sí · (b) No
     3. ¿Compras a crédito con cuentas por pagar? (a) Sí · (b) No
     4. ¿Multi-sucursal dentro de cada empresa? (a) Sí · (b) No
     5. ¿Volumen esperado por empresa? (a) < 200 docs/día · (b) 200–2000 · (c) > 2000
2. Con mis respuestas, entrega un **plan corto** (media pantalla): módulos, tablas, endpoints propios,
   pantallas, supuestos. **Espera mi OK.**
3. Tras el OK, codifica por fases (sección 12). Al final de cada fase: migraciones corren, lint limpio,
   tests verdes, y un resumen de 5 líneas.
4. Idioma del sistema: español (Perú). Moneda `PEN` (y `USD`), zona horaria `America/Lima`.
5. Tests en español, compatibles con SonarLint/SonarQube, objetivo de cobertura 100 % en servicios de dominio.

---

## 1) Objetivo

Construir un sistema **multiempresa** de compras y ventas, agnóstico del rubro (retail, ferretería,
farmacia, servicios, distribución…), que:

- Registre **compras** a proveedores e ingrese mercadería al almacén.
- Registre **ventas** y emita comprobantes electrónicos: **Factura (01), Boleta (03), Nota de Crédito (07),
  Nota de Débito (08), Guía de Remisión Remitente (09)** y opcionalmente Transportista (31).
- Imprima en **A4, A5, ticket 80 mm y ticket 58 mm**.
- Muestre el **estado SUNAT** de cada documento de forma inmediata y visual.
- Controle el acceso con **perfiles, roles y permisos** por empresa.

---

## 2) Arquitectura

```
[React SPA responsive]  ──HTTPS/JWT──>  [AdonisJS API]  ──X-Api-Key/X-Api-Secret──>  [API Facturación SUNAT]
                                              │
                                        [PostgreSQL]
                                              │
                                  [Worker de cola (jobs)]  → reconsulta de estados / reintentos
```

### 2.1 Frontend
- React 18 + Vite + TypeScript, React Router, TanStack Query, React Hook Form + Zod.
- UI: Tailwind + shadcn/ui, iconos Lucide. Mobile-first (POS usable en tablet y celular).
- **Nunca** contiene `api_key`/`api_secret` de SUNAT. Solo habla con el backend Adonis.

### 2.2 Backend
- AdonisJS 6 (TypeScript), Lucid ORM, VineJS (validación), Bouncer (autorización), Auth con access tokens.
- Capas: `controllers` → `services` (casos de uso) → `repositories/models`. Toda la integración SUNAT
  vive en **un único módulo** `app/integrations/sunat/` (cliente HTTP + mapeadores + tipos).
- Jobs en segundo plano (p. ej. `@rlanz/bull-queue` con Redis de Railway, o tabla `jobs` + scheduler si
  se quiere evitar Redis) para: envío asíncrono, reconsulta de estados, resumen diario, reintentos.

### 2.3 Base de datos
- PostgreSQL. **Todas** las tablas de negocio llevan `empresa_id` (multi-tenant por fila) + índices compuestos.
- Montos `numeric(14,2)`, cantidades `numeric(14,4)`, precios unitarios `numeric(14,6)`. Nada en `float`.
- Auditoría: `created_by`, `updated_by`, timestamps, y tabla `auditoria` (quién, qué, cuándo, antes/después).

### 2.4 Despliegue (Railway)
- Servicios: `web` (React estático), `api` (Adonis), `worker` (jobs), `postgres`, `redis` (si se usa cola).
- Variables: `APP_KEY`, `DATABASE_URL`, `REDIS_URL`, `SUNAT_API_BASE_URL`, `SUNAT_DEFAULT_ENV=beta`,
  `ENCRYPTION_KEY` (para cifrar credenciales por empresa).
- Migraciones en el `release`/pre-deploy. Health check en `/health`.

---

## 3) Multiempresa (cómo encaja con la API SUNAT)

La API SUNAT ya es multi-tenant: **cada empresa = un tenant con su propio `api_key`/`api_secret`**.

- Tabla `empresas`: ruc, razón social, nombre comercial, dirección, ubigeo, régimen (`general|mype|rer|rus`),
  entorno (`beta|production`), logo, **`sunat_api_key` y `sunat_api_secret` cifrados** (Adonis Encryption),
  `gre_configurada` (bool), estado.
- **Alta de empresa**: el backend llama `POST /registro` (multipart: RUC, usuario/clave SOL, certificado ≤ 100 KB,
  contraseña si `.pfx/.p12`, `client_id/client_secret` para guías). Guarda `api_key/api_secret` **de inmediato**:
  el secret se devuelve una sola vez. Rotación: `POST /empresa/credenciales/regenerar`.
- Luego: `POST /series/init-defaults` y series adicionales (`POST /series`) para NC, ND y guías.
- El cliente HTTP resuelve credenciales **por la empresa activa del request**, nunca globales.
- El usuario puede pertenecer a varias empresas; selector de empresa en el header. El token de sesión lleva
  `empresa_id` activo; cambiar de empresa re-emite el contexto.
- Sucursales (si aplica): sincronizar con `POST/PUT /sucursales` de la API (`cod_local` de 4 dígitos).

---

## 4) Seguridad: Perfil, Rol y Permisos

Modelo RBAC por empresa:

- `usuarios` (datos personales = **Perfil**: nombre, email, teléfono, foto, contraseña, 2FA opcional).
- `roles` (por empresa; plantillas: **Administrador, Vendedor, Cajero, Comprador, Almacenero, Contador, Solo lectura**).
- `permisos` (catálogo fijo `modulo.accion`, p. ej. `ventas.crear`, `ventas.anular`, `compras.aprobar`,
  `comprobantes.emitir_nc`, `config.series`, `reportes.ver`).
- `rol_permiso`, `usuario_empresa_rol` (un usuario puede tener rol distinto en cada empresa),
  `usuario_sucursal` (restricción por sucursal opcional).
- **Configurador de Rol**: pantalla con matriz módulos × acciones (checkboxes), clonar rol, no permitir
  borrar el último Administrador.
- **Configurador de Perfil**: el usuario edita sus datos, cambia contraseña, empresa/sucursal por defecto
  y formato de impresión preferido.
- Autorización en backend con Bouncer (policy por módulo). El frontend oculta lo no permitido, pero
  **la regla vive en el backend**.
- Acciones sensibles (anular, NC, cambio de precio bajo costo, borrar compra) quedan en auditoría.

---

## 5) Módulo de COMPRAS

Flujo estándar: **Orden de compra (opcional) → Registro de compra → Ingreso a almacén → Cuenta por pagar → Pago**.

- **Proveedores**: CRUD; autocompletar con `GET /buscar-documento?tipo=6&numero=…` de la API.
- **Orden de compra**: borrador → aprobada → recibida (parcial/total) → cerrada/anulada.
- **Registro de compra** (documento del proveedor): tipo (01/03/07/08/12…), serie-número, fecha, moneda,
  tipo de cambio, ítems, IGV, percepción si aplica. Valida que serie-número-RUC no se duplique.
- Al confirmar: genera **movimiento de kardex de entrada** y recalcula **costo promedio**.
- **Notas de crédito de proveedor** (devoluciones): salida de kardex.
- **Cuentas por pagar**: cuotas, vencimientos, pagos parciales.
- Nota: la API SUNAT **no registra compras de terceros** (solo SIRE/RCE y liquidaciones de compra);
  las compras viven en la BD local. SIRE queda fuera del alcance salvo que lo pida.

---

## 6) Módulo de VENTAS

Flujo estándar: **Cotización (opcional) → Venta/Pedido → Emisión SUNAT → Cobro → Despacho (guía)**.

### 6.1 Punto de venta / Venta
- Búsqueda de productos por código, nombre o código de barras; carrito; descuentos por ítem y global
  (global en **factor 0–1**, no 0–100); afectación IGV por producto (Cat 07: 10, 20, 30, 40…).
- Cliente: búsqueda por DNI/RUC con `GET /buscar-documento`; "CLIENTES VARIOS" por defecto en boleta.
- Elección automática del comprobante: RUC (tipo_doc 6) → **Factura**; DNI/sin doc → **Boleta**.
- Pagos mixtos: `efectivo, yape, plin, transferencia, tarjeta, cheque, otro`, con cálculo de vuelto.
- Contado o Crédito (crédito exige `cuotas[]`).
- Al confirmar: salida de kardex + emisión SUNAT en el mismo caso de uso (transacción local primero,
  envío a SUNAT después; ver 7.3).

### 6.2 Comprobantes (endpoints de la API)
| Documento | Endpoint | Reglas clave |
|---|---|---|
| Factura 01 | `POST /facturas` | serie `F###`; cliente RUC 11 díg (prefijo 10/15/17/20) con dirección; régimen NRUS no factura |
| Boleta 03 | `POST /boletas` | serie `B###`; si total > S/ 700 el cliente debe tener DNI/RUC |
| Nota de Crédito 07 | `POST /notas-credito` | `doc_afectado_tipo/serie/correlativo`, `cod_motivo` Cat 09; importe ≤ documento afectado |
| Nota de Débito 08 | `POST /notas-debito` | `cod_motivo` Cat 10 (intereses, penalidades, aumento de valor…) |
| Guía Remitente 09 | `POST /guias-remision` | destinatario, `cod_traslado` Cat 20, `mod_traslado` 01/02, partida/llegada (ubigeo), peso, bultos; 01 exige transportista, 02 exige vehículo+conductor |
| Guía Transportista 31 | `POST /guias-remision-transportista` | remitente ≠ emisor, `doc_relacionado[]`, vehículo y conductor |
| Baja facturas/NC/ND | `POST /anulaciones` | máx 7 días; **no** acepta boletas |
| Anulación de boletas | `POST /resumenes` con `anular[]` | las boletas se anulan por Resumen Diario |

- `precio_unitario` **incluye IGV**; el backend de la API recalcula totales. Guarda los totales devueltos.
- Una **NC** se genera desde el comprobante origen (botón "Emitir NC"), precargando ítems; la devolución
  repone stock si el motivo es 06/07.
- Si un `PUT` sobre documento aceptado devuelve `documento_aceptado_no_editable`, mostrar la
  `siguiente_accion` (emitir NC) como botón.
- Guías: requieren `client_id/client_secret` GRE en la empresa; si faltan, **bloquear** la emisión con
  mensaje claro (la API acepta el 201 pero luego rechaza).
- Documentos internos (no SUNAT): **Cotizaciones** (`/cotizaciones`) y **Notas de venta** (`/notas-venta`).

### 6.3 Impresión
- `GET /{tipo}/{id}/pdf?format=a4|a5|ticket-80|ticket-58`, descargado **desde el backend** (proxy) y
  servido al frontend como stream.
- Formato por defecto configurable por: empresa → sucursal → caja/usuario. Botón "Imprimir" usa el
  predeterminado; menú desplegable para los otros tamaños.
- Reimpresión, descarga XML (`/xml`) y CDR (`/cdr`), envío por email y por WhatsApp (link).
- El PDF lo genera la API con el logo de la empresa (`POST /empresa/logo`).

---

## 7) Estados SUNAT: visibles y manejables

### 7.1 Semáforo (igual en todo el sistema)
| Estado API (`datos.sunat.estado`) | Badge | Icono | Acción disponible |
|---|---|---|---|
| `pendiente` | Ámbar "Pendiente" | reloj | Enviar / Reconsultar |
| `enviado` | Azul "En proceso" | spinner | Reconsultar |
| `aceptado` | Verde "Aceptado" | check | Imprimir, NC/ND, Guía |
| `aceptado` con `notas` | Verde con punto ámbar "Aceptado con observaciones" | check + alerta | Ver observaciones |
| `rechazado` | Rojo "Rechazado" | x | Ver código/descripción, Corregir (`PUT`) y Reenviar |
| `anulacion_en_proceso` | Gris oscuro "Anulando" | spinner | Reconsultar |
| `anulado` | Gris "Anulado" | ban | Solo lectura |

- **`pendiente` y `enviado` no son errores** (envío asíncrono). No mostrarlos en rojo.
- Mostrar siempre `sunat.codigo` y `sunat.descripcion` en el detalle y en un tooltip del badge.

### 7.2 Bandeja de comprobantes
- Filtros por estado SUNAT (chips con contadores), tipo, serie, cliente, fechas, sucursal, estado de pago.
- Tarjeta superior: "N rechazados hoy", "N pendientes > 1 h", "N boletas sin resumen", alimentada por
  `GET /panel/estado-sunat` y `GET /panel/alertas`.
- Acción masiva: reconsultar seleccionados.

### 7.3 Robustez de envío
- Orden: guardar venta local (transacción) → encolar emisión → job llama a la API con **timeout 30–60 s**,
  reintento con backoff **solo** en red/5xx, nunca en 4xx.
- **Idempotencia**: guardar `comprobante_api_id` y reconsultar (`GET /{tipo}/{id}`) en vez de reemitir.
- Job programado cada 10 min: reconsulta todo lo que esté en `pendiente|enviado|anulacion_en_proceso`.
- Job diario: Resumen Diario de boletas pendientes (`POST /resumenes`) si la empresa lo usa.
- Errores normalizados: 401 (credenciales empresa), 403 `subscription_expired`, 422 (campo → mensaje),
  429 `limit_reached` (mostrar plan y límite).

---

## 8) Módulo de GESTIÓN

- **Dashboard** por empresa/sucursal: ventas hoy/semana/mes, compras, margen bruto, top productos/clientes,
  cuentas por cobrar y por pagar, estado SUNAT. Usar `/panel/*` de la API para lo fiscal y la BD local
  para compras, stock y márgenes.
- **Inventario**: productos/servicios (código, código de barras, unidad Cat 65, afectación IGV, precio,
  costo, stock mínimo, categoría), almacenes, kardex, ajustes y transferencias entre sucursales.
- **Caja**: apertura, ingresos/egresos, arqueo y cierre por usuario.
- **Cuentas por cobrar / pagar**: aging, pagos, vencimientos.
- **Reportes**: registro de ventas (`/reportes/registro-ventas`), registro de compras (local), ventas por
  cliente/producto/vendedor/sucursal, kardex valorizado, utilidad. Exportar a Excel y PDF.
- **Exportación fiscal**: ZIP de XML/PDF por rango (`GET /comprobantes/exportar-zip`).

---

## 9) Módulo de CONFIGURACIÓN

- Empresas (alta vía `/registro`, certificado, logo, entorno beta/producción, credenciales GRE).
- Sucursales, almacenes, cajas.
- Series por tipo de documento y sucursal.
- Formato de impresión por defecto (A4/A5/80/58).
- Parámetros: IGV, ICBPER, moneda por defecto, redondeo, permitir venta sin stock (sí/no).
- Usuarios, roles y permisos (sección 4).

---

## 10) Modelo de datos mínimo (ajusta con mis respuestas)

`empresas, sucursales, almacenes, cajas, usuarios, roles, permisos, rol_permiso, usuario_empresa_rol,
usuario_sucursal, series, clientes, proveedores, categorias, productos, precios, stock,
movimientos_kardex, ordenes_compra, ordenes_compra_items, compras, compras_items, cuentas_pagar,
pagos_proveedor, cotizaciones, ventas, ventas_items, ventas_pagos, cuotas, comprobantes
(tipo, serie, correlativo, numero_completo, comprobante_api_id, sunat_estado, sunat_codigo,
sunat_descripcion, sunat_notas, hash_cpe, xml_url, cdr_url, total, doc_referencia_id),
guias, guias_items, resumenes, anulaciones, cuentas_cobrar, aperturas_caja, auditoria, jobs_log`.

Relación clave: `ventas 1—N comprobantes` (factura/boleta y luego sus NC/ND), `comprobantes.doc_referencia_id`
apunta al documento afectado.

---

## 11) Diseño de interfaz

- Sobrio: un color de acento + neutros; sin degradados ni sombras fuertes; bordes finos.
- Navegación lateral por módulos (Compras, Ventas, Gestión, Configuración) que se colapsa en móvil.
- POS con atajos de teclado (F2 buscar, F4 cliente, F9 cobrar, Esc cancelar).
- Tablas con paginación del servidor (la API anida la paginación en `datos.paginacion`).
- Modo oscuro opcional.

---

## 12) Fases de entrega

1. **Base**: monorepo (`apps/web`, `apps/api`), auth, multiempresa, RBAC, auditoría, deploy en Railway.
2. **Integración SUNAT**: cliente HTTP, alta de empresa, series, prueba de humo en `beta`
   (registro → series → boleta → PDF ticket-80 → factura → error 422 controlado).
3. **Inventario + Compras**: productos, proveedores, compras, kardex, cuentas por pagar.
4. **Ventas**: POS, factura, boleta, pagos, impresión en 4 formatos, bandeja con estados.
5. **NC, ND, Guías, Anulaciones/Resumen**.
6. **Gestión**: dashboard, caja, CxC, reportes, exportaciones.
7. **Endurecimiento**: tests, cobertura, rendimiento, README (variables, alta de empresa, paso a producción).

---

## 13) Criterios de aceptación

- [ ] Ninguna credencial SUNAT llega al navegador; credenciales cifradas por empresa.
- [ ] Un usuario solo ve datos de la empresa activa (prueba automatizada de aislamiento entre empresas).
- [ ] Permisos verificados en backend para cada endpoint.
- [ ] Factura, boleta, NC, ND y guía emitidas y **aceptadas en beta**.
- [ ] Reglas: factura solo con RUC; boleta > S/ 700 con documento; NC ≤ documento afectado; boletas se
      anulan por resumen y facturas por baja.
- [ ] Impresión correcta en A4, A5, 80 mm y 58 mm.
- [ ] Estados SUNAT con el semáforo de la sección 7; `pendiente/enviado` no se muestran como error.
- [ ] Reconsulta automática de estados y reintentos idempotentes.
- [ ] Compra confirmada actualiza stock y costo; venta lo descuenta; NC por devolución lo repone.
- [ ] Lint y tests en verde; README completo.
