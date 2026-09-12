# RUNBOOK DE DESPLIEGUE Y MIGRACIONES

> **Sprint CI-6.** Procedimiento operativo para promover el ERP a producción y para revertir.
> Cada paso está verificado contra el código de ESTE repo y contra la documentación oficial de
> Payload 3.x / Supabase / Vercel (fuentes en §9). No contiene pasos "de memoria".

---

## 1. Modelo de conexiones (por qué hay dos URLs)

`src/payload.config.ts` elige la conexión según el contexto:

```ts
const isMigration = process.env.IS_PAYLOAD_MIGRATION === 'true' ||
                    process.argv.some((arg) => arg.includes('migrate'));

const dbConnectionString = isMigration
  ? process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URI || ...
  : process.env.DATABASE_URI || ...;
```

| Contexto | Variable | Puerto Supabase | Modo |
|---|---|---|---|
| **Runtime serverless** (Vercel) | `DATABASE_URI` | **6543** | Transaction Pooler (`pgbouncer=true`, `pool.max = 10`) |
| **CLI de migraciones** (`pnpm migrate`, `migrate:create`, `migrate:status`, `payload migrate:down`) | `DATABASE_DIRECT_URL` | **5432** | Conexión directa |

**Regla dura:** el DDL (`ALTER TABLE`, `CREATE INDEX`, cambios de tipo) va SIEMPRE por **5432 / conexión
directa**. El Transaction Pooler (6543) abre y cierra transacciones por sentencia y **no soporta** el
DDL de forma fiable. Los scripts `pnpm migrate*` ya fuerzan `IS_PAYLOAD_MIGRATION=true`; para el resto de
subcomandos, el fallback por `argv` (contiene `migrate`) hace lo mismo.

> ⚠️ **Nunca** ejecutes migraciones apuntando a la base de otro proyecto. El proyecto de producción es
> Supabase **`empresarial-saas`** (`mzpqwaepkyhktfvgbxcq`); no confundir con `storelink-db`.

---

## 2. Prerrequisitos (una sola vez)

- [ ] Acceso al proyecto Supabase de producción y a su **contraseña de base de datos**.
- [ ] Acceso al proyecto de Vercel con permiso de *Environment Variables* y *Deployments*.
- [ ] Variables configuradas en Vercel (**Production**):
  - [ ] `DATABASE_URI` (6543, con `pgbouncer=true`)
  - [ ] `DATABASE_DIRECT_URL` (5432) — la usan los scripts de migración desde CI/local, no el runtime
  - [ ] `PAYLOAD_SECRET` (≥ 32 caracteres; el arranque falla sin él)
  - [ ] `PUBLIC_BASE_URL` y `NEXT_PUBLIC_SITE_URL` (**sin** slash final) — de aquí salen los enlaces
        `/share/*` y los emails; si faltan, los enlaces se generan vacíos
  - [ ] `CRON_SECRET` (ver §6)
  - [ ] `RESEND_API_KEY` **o** el juego `SMTP_*` (sin ninguno, dev usa el mock de Ethereal — **no** en prod)
  - [ ] `SUPABASE_CA_CERT` si el certificado del proyecto no está en el CA bundle del runtime
  - [ ] `S3_*` si se usa almacenamiento externo (el origen del endpoint entra solo en la CSP: `img-src`)
- [ ] Un programador externo de cron (Vercel Cron o cron-job.org / GitHub Actions) — ver §6.

---

## 3. Checklist de promoción (orden estricto)

### 3.1 Antes de tocar producción (en tu máquina o CI)
```bash
git checkout main && git pull --ff-only        # el deploy sale SIEMPRE de main
pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm test       # debe estar verde
```
- [ ] El PR mergeado estaba **verde en CI** (typecheck · lint · tests con ratchet de cobertura · audit · build).
- [ ] Si el PR traía migración: el archivo está en `src/migrations/` **y** registrado en
      `src/migrations/index.ts` (un archivo sin registrar **no se aplica nunca**).

### 3.2 Estado del esquema del destino (informativo)
```bash
# Apunta al destino con la conexión DIRECTA y sólo MIRA (no escribe):
DATABASE_DIRECT_URL="postgresql://…:5432/postgres" pnpm migrate:status
```
> ℹ️ **`migrate:status` no es un gate**: verificado en `payload/dist/bin/migrate.js`, **sale con código 0
> aunque haya pendientes**. Sirve para saber qué va a pasar, no para bloquear. El gate real de "el repo no
> introduce drift" es `tests/integration/schemaMirror.test.ts` (CI).

### 3.3 Aplicar migraciones (paso deliberado, ANTES del deploy)
```bash
DATABASE_DIRECT_URL="postgresql://…:5432/postgres" pnpm migrate
```
- [ ] Salida sin errores y `Done.`
- [ ] **Verificación independiente** (SQL, por conexión directa):
      ```sql
      SELECT name, batch FROM payload_migrations ORDER BY batch, id;
      ```
      Cada migración nueva del PR debe aparecer aquí.

### 3.4 Desplegar
- [ ] Promover el deployment de `main` en Vercel (Production).
- [ ] El build corre `pnpm build` (`next build`), **sin** migraciones embebidas (ver §7.1).

---

## 4. Verificación post-deploy (smoke, 2 minutos)

| # | Comprobación | Cómo | Esperado |
|---|---|---|---|
| 1 | Liveness + base de datos | `curl -sS -o /dev/null -w '%{http_code}' https://<dominio>/api/health` | `200` |
| 2 | Cuerpo del health | `curl -sS https://<dominio>/api/health` | `{"ok":true}` |
| 3 | Admin operativo | abrir `https://<dominio>/admin/login` en el navegador | carga el formulario, **sin** errores de CSP en consola |
| 4 | Cabeceras de seguridad | `curl -sSI https://<dominio>/admin/login \| grep -i 'content-security-policy\|x-frame-options'` | CSP y `X-Frame-Options: DENY` presentes |
| 5 | Guard del runner de jobs | `curl -sS -o /dev/null -w '%{http_code}' https://<dominio>/api/payload-jobs/run?queue=alerts` | `401` (fail-closed sin Bearer) |
| 6 | Login real y una venta de humo | entrar al ERP con un usuario de prueba | sin errores |

> Si el health devuelve **503**, el servicio está arriba pero **no alcanza la base de datos**: revisa
> `DATABASE_URI`, el pooler y las credenciales antes de seguir.

> El repo incluye un smoke E2E de navegador (Sprint CI-4) que cubre 1, 3, 4 y 5 automáticamente:
> `pnpm test:e2e` en local, o el workflow **E2E (Playwright) — smoke** (manual + nocturno) en GitHub.

---

## 5. Rollback

**5.1 Revertir el código** (lo primero y más rápido): promover el deployment anterior en Vercel.

**5.2 Revertir el esquema** (sólo si la migración lo exige y el código ya volvió atrás):
```bash
DATABASE_DIRECT_URL="postgresql://…:5432/postgres" pnpm payload migrate:down
```
- Revierte **el último lote** aplicado (`batch`), con el `down()` que cada migración de este repo define.
- ⚠️ **Antes de revertir, mide el impacto en datos**: varios `down()` **borran filas** que usan el valor
  que se está quitando (patrón documentado en `20260911_234000_fix_jobs_queue_schema`). Si hay datos
  nuevos que dependen de la migración, el rollback **los pierde** — en ese caso, preferir un arreglo
  hacia adelante (una migración correctiva) en vez de revertir.
- `migrate:refresh` / `migrate:reset` / `migrate:fresh` **eliminan y recrean** el esquema: **jamás** en
  producción (`refresh` borra y vuelve a aplicar; `reset`/`fresh` destruyen datos). Sólo en local o CI.

---

## 6. Trigger de los jobs programados (Sprint R5)

`jobs.autoRun` **no** se usa (cron in-process, no fiable en serverless). El disparo real es un cron
externo que llama al endpoint **nativo** de Payload:

```
GET https://<dominio>/api/payload-jobs/run?queue=alerts
Authorization: Bearer $CRON_SECRET
```

- [ ] `?queue=alerts` es **obligatorio**: sin él Payload opera sólo la cola `default` y `evaluateAlerts`
      (agendada en `alerts`) **nunca se encolaría** (reporte Devin #90).
- [ ] Cadencia recomendada: cada 15 min (la tarea está agendada `*/15 * * * *`).
- [ ] En Vercel **Hobby** los cron jobs están limitados (≈1 ejecución al día) ⇒ usar un plan superior o un
      programador externo (cron-job.org / GitHub Actions) con la misma URL y el mismo Bearer.
- [ ] **No crear un endpoint propio** para esto: el oficial ya encola lo vencido (`handleSchedules`) y
      ejecuta la cola en la misma llamada. Está protegido por `jobs.access.run = canRunScheduledJobs`
      (cron con `Bearer`, o super-admin; todo lo demás 401).
- [ ] Sin `CRON_SECRET` configurado, el endpoint es **fail-closed** (401).

---

## 7. Decisiones registradas (y por qué)

### 7.1 NO se embebe `payload migrate` en el build de Vercel
La documentación oficial de Payload propone `"ci": "payload migrate && pnpm build"`. **Aquí NO se aplica a
Vercel**, y es deliberado: Vercel ejecuta el *build* también en **cada preview**, y esos previews apuntan
a las mismas variables de producción ⇒ se estaría ejecutando **DDL sobre la base de producción desde un
preview**, sin control ni revisión. Las migraciones son un paso **explícito** (§3.3). En CI sí corre
`pnpm migrate` (contra el Postgres desechable del runner), que es donde tiene sentido.

### 7.2 El DDL nunca por el pooler (6543)
Ver §1. Es un invariante de infraestructura, no una preferencia.

### 7.3 `migrate:status` informa, no bloquea
Ver §3.2. El repo **no** incluye un paso de CI con `migrate:status` porque sería decorativo (sale 0).
La guarda real anti-drift es `schemaMirror.test.ts` + `pnpm migrate` en CI.

### 7.4 Preview y producción comparten base
Consecuencia de 7.1: un preview puede escribir en la base de producción (es intencional para poder probar
con datos reales). Si en algún momento se quiere aislar, crear un proyecto Supabase de *staging* y mapear
`DATABASE_URI`/`DATABASE_DIRECT_URL` por entorno en Vercel — **no** cambiar el código.

---

## 8. Anti-patrones (lo que NO se hace)

- ❌ Correr `migrate` apuntando a producción **por el puerto 6543**.
- ❌ Editar a mano una migración ya aplicada (el `batch` en `payload_migrations` queda desincronizado).
- ❌ Añadir un archivo de migración sin registrarlo en `src/migrations/index.ts` (jamás se aplica).
- ❌ `migrate:reset` / `migrate:fresh` en producción.
- ❌ Depender de `migrate:status` como puerta de calidad.
- ❌ Poner `payload migrate` en el build de Vercel (ver 7.1).
- ❌ Confundir el proyecto Supabase: producción = **`empresarial-saas`** (`mzpqwaepkyhktfvgbxcq`).

---

## 9. Fuentes

- Payload — Migrations (`docs/database/migrations.mdx`): `payload migrate`, `migrate:status`,
  `migrate:down`, `migrate:refresh/reset/fresh`, y el patrón `"ci": "payload migrate && pnpm build"`.
- Payload — Jobs Queue: `handleSchedules`, `jobs.autoRun`, endpoint `/api/payload-jobs/run`.
- Supabase — Connection modes: Transaction Pooler (6543) vs direct (5432); DDL por conexión directa.
- Vercel — Cron Jobs y límites por plan; reglas de *preview deployments* y variables por entorno.
- Este repo: `src/payload.config.ts` (§1), `.env.example` (variables), `.github/workflows/ci.yml`
  (qué corre en CI), `tests/integration/schemaMirror.test.ts` (guarda de drift),
  `src/app/api/health/route.ts` (smoke), `src/utilities/cronAuth.ts` (guard del cron).


