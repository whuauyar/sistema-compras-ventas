# Sistema de Compras y Ventas (multiempresa) con facturación SUNAT

React (responsive) + AdonisJS 6 + PostgreSQL, desplegable en Railway. La facturación electrónica se **consume** de la API [`whuauyar/plataform-api-sunat`](https://github.com/whuauyar/plataform-api-sunat); este sistema no firma ni envía XML por su cuenta.

```
apps/
  api/   AdonisJS 6 (API REST /api/v1, worker de cola, migraciones, tests Japa)
  web/   React 19 + Vite + Tailwind 4 + TanStack Query
scripts/
  sunat-mock.mjs   simulador local de la API SUNAT (solo desarrollo)
docs/
  PROMPT-Sistema-Compras-Ventas-SUNAT.md   especificación completa (7 fases)
```

## Estado

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Auth, multiempresa, perfil, roles/permisos (RBAC), auditoría, despliegue | ✅ |
| 2 | Cliente SUNAT, alta/vínculo de empresa, sucursales, series, emisión factura/boleta, estados SUNAT, impresión 4 formatos | ✅ |
| 3 | Inventario (kardex valorizado) + Compras + Cuentas por pagar | Pendiente |
| 4 | POS / Ventas con stock, pagos, crédito, cuentas por cobrar | Pendiente |
| 5 | Notas de crédito/débito, guías de remisión, anulaciones y resumen diario | Pendiente |
| 6 | Dashboard, caja, reportes, exportaciones | Pendiente |
| 7 | Endurecimiento | Pendiente |

## Desarrollo local

Requisitos: Node 22+, PostgreSQL 14+.

```bash
# 1) Backend
cd apps/api
cp .env.example .env            # completar DB_*, ENCRYPTION_KEY y SUNAT_API_BASE_URL
node ace generate:key
npm install
node ace migration:run
node ace db:seed                 # catálogo de permisos (idempotente)
npm run dev                      # http://localhost:3333
npm run worker                   # en otra terminal: envíos y reconsultas SUNAT

# 2) Frontend
cd apps/web
npm install
npm run dev                      # http://localhost:5173 (proxy /api → :3333)

# Opcional: simulador SUNAT (SUNAT_API_BASE_URL=http://localhost:9999/api/v1)
node scripts/sunat-mock.mjs
```

Con el simulador, cualquier api_key/api_secret sirve para "Vincular empresa". Un cliente cuya razón social contenga `RECHAZO` produce un comprobante rechazado (útil para probar la bandeja).

### Pruebas

```bash
cd apps/api
cp .env.test.example .env.test   # base de datos de pruebas aparte
npm test                  # 83 pruebas (unitarias + funcionales)
npm run test:cobertura    # c8: ~99.6 % líneas, ~90 % ramas
npm run lint && npm run typecheck
```

La API SUNAT se reemplaza en las pruebas por `SunatFalsa` (`tests/helpers.ts`): no se hace ninguna llamada real.

## Variables de entorno (API)

| Variable | Uso |
|---|---|
| `APP_KEY` | Firma de Adonis (`node ace generate:key`) |
| `DATABASE_URL` | La inyecta Railway; tiene prioridad sobre `DB_*` |
| `ENCRYPTION_KEY` | Cifra api_key/api_secret de cada empresa. **No cambiarla** sin re-cifrar: las credenciales guardadas dejarían de leerse |
| `SUNAT_API_BASE_URL` | Base de la API de facturación: `https://api-sunat-production-6c5ea01b.up.railway.app/api/v1` |
| `SUNAT_API_TIMEOUT_MS` | Timeout por petición (defecto 45000) |
| `CORS_ORIGINS` | Dominio(s) del frontend, separados por coma |

Frontend: `VITE_API_URL` (URL pública del backend; se fija **al compilar**).

## Despliegue en Railway

Un proyecto con 4 servicios, todos desde este repo:

| Servicio | Root directory | Config file | Notas |
|---|---|---|---|
| `postgres` | — | — | Plantilla PostgreSQL |
| `api` | `apps/api` | `apps/api/railway.json` | Variables de la tabla anterior; `DATABASE_URL=${{postgres.DATABASE_URL}}`; `HOST=0.0.0.0`, `NODE_ENV=production`, `LOG_LEVEL=info`. Migra y siembra permisos en pre-deploy |
| `worker` | `apps/api` | `apps/api/railway.worker.json` | Mismas variables que `api`. Sin dominio público |
| `web` | `apps/web` | `apps/web/railway.json` | `VITE_API_URL=https://<dominio-api>` |

Luego poner el dominio de `web` en `CORS_ORIGINS` del `api`.

## Decisiones de arquitectura

- **Multiempresa por fila**: toda tabla de negocio lleva `empresa_id`. La empresa activa llega en la cabecera `X-Empresa-Id` y `empresa_middleware` verifica la membresía en cada request (no se confía en el frontend).
- **Cada empresa = un tenant de la API SUNAT** con sus credenciales cifradas (`ENCRYPTION_KEY`). El navegador nunca las ve: PDF/XML/CDR se descargan a través del backend.
- **Emisión idempotente**: el comprobante se guarda primero con un `uuid` que viaja como `Idempotency-Key`. Si la API cae, queda en `error_envio` y el worker lo reintenta sin duplicar.
- **Estados SUNAT asíncronos**: `pendiente`/`enviado` no son errores. El worker reconsulta hasta que se definan y cada 10 min barre los olvidados.
- **Cola en PostgreSQL** (`FOR UPDATE SKIP LOCKED`), sin Redis. Para volúmenes > 2 000 docs/día conviene pasar a Redis/BullMQ.
- **RBAC por empresa**: un usuario puede ser Administrador en una empresa y Vendedor en otra. El rol Administrador no se puede borrar, renombrar ni recortar, y la empresa nunca queda sin un Administrador activo.
- **Formato de impresión**: usuario > caja > sucursal > empresa, o el elegido en el menú.

## API (resumen)

Públicas: `POST /auth/registro`, `POST /auth/login`.
Autenticado: `GET /auth/yo`, `POST /auth/logout`, `GET|PUT /perfil`, `PUT /perfil/password`, `POST /empresas/registrar` (multipart), `POST /empresas/vincular`.
Con empresa activa (`X-Empresa-Id`) y permiso: `empresa`, `sucursales`, `series`, `permisos`, `roles` (+ `clonar`), `usuarios`, `comprobantes` (+ `resumen-estados`, `reconsultar`, `reenviar`, `pdf?formato=`, `xml`, `cdr`), `consultas/documento`, `auditoria`.
