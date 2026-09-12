# 🔬 FASE 13 — Investigación: Render, Escala (10k SKUs), Multi-tenant oficial y PWA de Vendedores

> **Documento de investigación previo a la ejecución.** Fuentes: docs oficiales de Payload (multi-tenant, database/migrations, jobs-queue, rest-api vía Context7/Firecrawl), skill de Payload y auditoría del código propio con codegraph. Nada de esto se ejecuta sin PR propio por sprint.
>
> **ESTADO (2026-09-11): SIN EJECUTAR — investigación vigente.** Es el prerrequisito
> técnico de escala y de los gates de go-live (§8). El bloque de Implementaciones
> Estructurales (producto) ya se ejecutó y fusionó completo; esta fase es lo que sigue
> en infraestructura.

---

## 1. Migración a Render — lo que cambia y lo que se GANA

El sistema vive hoy en Vercel (serverless) + Supabase. Render es un **servidor de larga vida**, y eso habilita tres capacidades oficiales de Payload que en serverless estaban prohibidas:

### 1.1 Migraciones automáticas al desplegar — `prodMigrations`
Docs oficiales (database/migrations): en servidores de larga vida se pasa el índice de migraciones al adaptador y **Payload las ejecuta al iniciar** — recomendado JUSTO para servidores de larga vida y desaconsejado en serverless (cold starts).

```ts
import { migrations } from './migrations'
db: postgresAdapter({ ..., prodMigrations: migrations })
```

**Impacto:** desaparece el paso manual "aplicar migraciones a producción vía MCP/SQL" (el que rompió main en la Fase 11). Cada deploy de Render aplica lo pendiente, en orden, con registro en `payload_migrations`.

### 1.2 Jobs Queue RE-activable — importaciones de 10k SKUs por el canal oficial
En Vercel desactivamos la Jobs Queue (`disableJobsQueue: true`) porque no hay runner. En Render, la doc oficial recomienda para servidores dedicados:

- **Bin script**: `pnpm payload jobs:run --cron "* * * * *"` como proceso independiente (recomendado), o
- **`autoRun`** dentro del proceso de Next (`jobs: { autoRun: [{ cron: '...', queue: '...' }] }`).

**Impacto:** se puede re-activar la Jobs Queue del `import-export` y subir los límites — **10.000 SKUs en UNA corrida por cola**, con reintentos y progreso, en vez de 5 tandas síncronas de 2.000. También habilita el evaluador de alertas como job programado (hoy necesita disparo externo).

### 1.3 Otros cambios de Render
- **Sin cold starts**: los RSC pesados (dashboard, catálogos) dejan de pagar arranque por request.
- **Postgres de Render**: conexión directa interna (misma VPC), PgBouncer incluido — la config de pool (`max: 10`, SSL de Supabase, CA cert) se adapta: sin `SUPABASE_CA_CERT`, sin mención al 6543. Revisar `payload.config.ts` (pool + `prodMigrations`) y `AGENTS.md §3` (el "puerto 5432/6543 de Supabase" deja de aplicar).
- **Media**: ya corre sobre `storage-s3` (compatible con cualquier S3-compatible; Render no necesita disco persistente).
- **Cron**: el evaluador de alertas pasa a `autoRun` o bin script (ver 1.2).

---

## 2. Multi-tenant — alineación con lo que recomienda Payload (auditoría oficial)

Nuestra implementación **ya es el patrón oficial**: colección `tenants` propia, `multiTenantPlugin({ collections: {...} })` sobre las ~20 colecciones, y el `tenantsArrayField` en Users (membresías inquilino↔usuario con rol), JWT con `saveToJWT`.

Lo que los docs oficiales recomiendan y nuestro estado:

| Recomendación oficial | Estado nuestro | Acción |
|---|---|---|
| `tenantsArrayField` en la colección auth (membresías) | ✅ Implementado | — |
| `useBaseFilter` (filtra automáticamente por tenant en TODO, no solo list views) | ✅ Por defecto del plugin | — |
| `useTenantAccess` (constraints multi-tenant sobre el access de cada colección) | ✅ Por defecto | — |
| `cleanupAfterTenantDelete` (limpia documentos y membresías al borrar un tenant) | ✅ Default `true` | Verificar en el flujo de baja de cliente-SaaS |
| `isGlobal` para colecciones tenant-scoped tipo global | Parcial (media, tenants) | Revisar colecciones que deban ser globales |
| **RLS de Postgres como defensa en profundidad** | ❌ No existe | **Opcional (post-Fase 13)**: políticas por `tenant_id` — es el upgrade que hace el aislamiento inmune a bugs de aplicación. Sin "una Postgres por tenant" |
| **Aislamiento de Cookies/CORS para API multi-tenant** | Revisar `serverURL`/CORS por dominio de inquilino si se usan dominios propios | Pendiente si se venden dominios propios |

**Conclusión:** cumplimos la recomendación oficial del plugin. El upgrade real para SaaS serio es **RLS** (defensa en profundidad, estilo Cendaro) — sprint dedicado, no urgente.

---

## 3. 10.000 SKUs — búsqueda server-side (la solución documentada)

**Payload no prescribe un "plugin de búsqueda"** (el plugin `search` es para contenido SEO). El patrón documentado es: **consultas Local/REST con `where` + índices de base de datos**. Todo el catálogo vive en UNA collection (`products`) con `tenant` — correcto: el plugin filtra por inquilino automáticamente.

**El problema actual:** `getProductsCatalog` trae el catálogo COMPLETO (findAllDocs, depth 1) en cada página que lo usa (POS, facturas, cotizaciones) y el typeahead filtra en el navegador. Fluido hasta ~2-3k SKUs; a 10k, payload RSC + memoria del navegador se degradan.

**Solución (siguiente sprint técnico):**
1. Server Action `searchProductsAction(tenantId, query)` → `payload.find` con `where: { or: [{ sku: { like: q } }, { name: { like: q } }] }`, `limit: 20`, `select` mínimo.
2. Índice trigram en Postgres (`pg_trgm` + `GIN` sobre `sku`/`name`) vía migración — búsqueda parcial instantánea a cualquier escala.
3. POS y QuickQuote consultan con debounce (~200ms) en vez de recibir el catálogo completo.
4. La vista de catálogo migrar a paginación server-side (mismo patrón de facturas).

**Escalabilidad resultante:** cómodo hasta 50k-100k SKUs por inquilino (límite real: tamaño de Supabase/Render, no del código).

---

## 4. PWA de Vendedores — plan SIN offline (decisión: no complicarnos)

**Base técnica:** Payload genera **REST API completa con auth JWT** (docs oficiales: collections CRUD + auth + SDK type-safe). La PWA es un **cliente Next.js mobile-first del mismo sistema**: mismo login (JWT), mismo RBAC (rol `vendor` ya existe con scoping por canal), mismos datos. **No es una app aparte: es la misma app con vistas mobile.**

**Alcance Fase 13-PWA (online-first, instalable):**
1. **Manifest + service worker de shell** (instalable en el home del teléfono; caché del shell, nunca de datos).
2. **3 pantallas vendor mobile-first:**
   - **Cobrar/Abonar**: cliente → monto → método (reutiliza `createPaymentAction` — ya soporta allocation FIFO e IGTF).
   - **Mi cartera**: sus clientes con saldo y vencimientos (ya existe el scoping por vendedor en `getAccountsReceivableData`).
   - **Inventario**: consulta de stock por SKU (búsqueda server-side del punto 3).
3. **Auto-envío ya cubre la notificación al cliente** (presupuesto/factura por Resend).
4. **REST + JWT**: `prepareDocumentEmail` y actions reutilizan la misma lógica; para REST se usan los mismos endpoints con token Bearer.

**Lo que NO incluye (decisión):** offline, cola IndexedDB, sync de conflictos. Si algún día la cobertura real lo exige, es el proyecto más complejo del sistema (resolución de conflictos de numeración/stock) — se planificará con datos de uso reales.

**Esfuerzo:** 2-3 sprints (shell + 3 pantallas + ajustes mobile de las vistas existentes).

---

## 5. Capacidad — números y plan para 100 inquilinos × 5-7 usuarios

**Hoy:** decenas de inquilinos y cientos de usuarios operan sin problema (Vercel escala horizontal; la BD es el límite real). Los tres puntos calientes medidos en código:

| # | Punto caliente | Impacto a escala | Solución |
|---|---|---|---|
| 1 | `getDashboardMetrics`: 6 escaneos completos por vista | El dashboard degrada primero | Reescribir agregados como SQL (`SUM/COUNT/GROUP BY`) — 1 sprint |
| 2 | Catálogo completo en POS/cotizaciones | Degrada con 10k SKUs | Typeahead server-side + pg_trgm (§3) — 1 sprint |
| 3 | Pool `max: 10` (Supabase) | Saturación de conexiones en picos | En Render: PgBouncer interno + revisar `max` (1 día) |

**Meta 100 inquilinos × ~6 usuarios (≈600 usuarios, ~50-100 concurrentes pico):** alcanzable con los 3 puntos de arriba + los índices ya existentes. La carga por usuario ERP es baja (algunas consultas por minuto). Supabase/Render Postgres maneja eso con holgura.

---

## 6. Orden de ejecución propuesto (Fase 13)

1. **Migración a Render** (+ `prodMigrations` + Jobs Queue re-activable + cron de alertas) — es prerrequisito de escala.
2. **Sprint de escala**: typeahead server-side + pg_trgm + dashboard SQL.
3. **PWA vendedores online-first** (3 pantallas + shell).
4. **RLS de Postgres** (defensa en profundidad, opcional pero recomendado para SaaS con terceros).
5. **E2E + monitoreo** (el cierre que ya tenemos agendado).

## 7. Decisiones abiertas que requieren al dueño
- ¿Se venderán dominios propios por inquilino? (define CORS/multi-dominio del PWA/admin)
- ¿El POS de mostrador necesita entregar "nota" impresa? (S41.2-residual — solo formato de impresión)
- Plan de Render: tier de Postgres y número de instancias del web service.

## 8. Gates de go-live antes del primer tenant real (centralizado 2026-09-11)

> Resumen unificado de todo lo pendiente del proyecto en
> [`ROADMAP.md` → «Roadmap activo»](../ROADMAP.md). Requisitos acordados en el análisis
> comparativo de plataforma (2026-09-11). El bloque de producto ya cumple el suyo
> (ledgers con tests en CI); esto es lo que falta para **cobrar por el sistema con datos
> de un cliente real**:

| # | Gate | Estado | Notas |
|---|---|---|---|
| 1 | Tests financieros de ledgers en CI | 🟡 Parcial | Suite de 108 tests (9 archivos) con kardex/ventas/crédito; ampliar a cash/finance/AP completos |
| 2 | PITR + restore **probado** en Supabase | 🔴 Pendiente | Restore de práctica ejecutado y medido, no solo el backup activado |
| 3 | Observabilidad (Sentry u equivalente) | 🔴 Pendiente | Hoy los errores solo viven en logs de Vercel |
| 4 | Runner de cron para las alertas | 🔴 Pendiente | El evaluador necesita disparo externo en Vercel (ver §1.2 — se resuelve con Render) |
| 5 | Disciplina de migraciones | 🟡 En camino | Proceso definido (MCP/SQL mismo día del merge); el caso `add_approvals` (2026-09-11) dejó la lección y el chequeo post-merge `payload_migrations` vs repo |

Los gates 2–4 tienen soluciones naturales dentro de esta fase: PITR es configuración de
Supabase + ensayo; Sentry es un PR pequeño; el runner de cron desaparece como problema
con la migración a Render (§1.1–1.2).
