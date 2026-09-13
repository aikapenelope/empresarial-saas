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
- [ ] **Aislamiento de entornos (🟥 ver §7.4)**: `DATABASE_URI`, `DATABASE_DIRECT_URL` y `PAYLOAD_SECRET`
      acotados a **`Production`** en Vercel; el entorno *Preview* apunta a una base de **staging** (o a
      ninguna). Un preview nunca debe poder escribir en la base de producción.
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
- [ ] **Puerta de compatibilidad (🟥 obligatoria antes de aplicar nada)**: clasificar la migración como
      **COMPATIBLE** o **INCOMPATIBLE** con el código que está sirviendo tráfico **ahora mismo**.
      Es incompatible si **renombra, elimina o cambia el tipo** de algo que el despliegue actual
      lee o escribe. Ejemplo real de este repo:
      `20260906_080000_drop_users_password_column` ejecuta `ALTER TABLE "users" DROP COLUMN`.
      La clasificación decide el procedimiento de §3.3 (y el orden del rollback de §5).

### 3.2 Estado del esquema del destino (informativo)
```bash
# Apunta al destino con la conexión DIRECTA y sólo MIRA (no escribe):
DATABASE_DIRECT_URL="postgresql://…:5432/postgres" pnpm migrate:status
```
> ℹ️ **`migrate:status` no es un gate**: verificado en `payload/dist/bin/migrate.js`, **sale con código 0
> aunque haya pendientes**. Sirve para saber qué va a pasar, no para bloquear. El gate real de "el repo no
> introduce drift" es `tests/integration/schemaMirror.test.ts` (CI).

### 3.3 Aplicar migraciones (paso deliberado, ANTES del deploy)

> ⚠️ **Por qué el orden importa** (hallazgo 🔴 de Devin #99): entre «aplicar la migración» y «promover el
> deployment» **el código viejo sigue sirviendo tráfico** contra el esquema nuevo. Si la migración es
> incompatible con ese código, producción se rompe en esa ventana — y **se queda rota** si la promoción
> falla. Por eso hay dos caminos según la clasificación de §3.1.

#### 3.3.A COMPATIBLE → *expand-contract* (cero downtime, el camino por defecto)
La migración sólo **añade** (columnas nuevas nullable, tablas nuevas, índices) o el código nuevo tolera
ambos esquemas:

```bash
DATABASE_DIRECT_URL="postgresql://…:5432/postgres" pnpm migrate   # 1) expandir
```
- [ ] Salida sin errores y `Done.`
- [ ] Verificación independiente (conexión directa):
      ```sql
      SELECT name, batch FROM payload_migrations ORDER BY batch, id;
      ```
      Cada migración nueva del PR debe aparecer aquí.
- [ ] Promover el deployment (§3.4). El código nuevo usa el esquema nuevo; el viejo lo ignora.
- [ ] **Contraer en un segundo release** (borrar la columna/tabla obsoleta) cuando ya no quede código
      antiguo en vuelo. Así un `DROP` nunca coincide con el deployment que aún lo usa.

#### 3.3.B INCOMPATIBLE (rename / drop / cambio de tipo) → ventana de mantenimiento
Este camino **no es cero-downtime** y hay que asumirlo explícitamente. **Preferencia fuerte: convertir el
cambio en A** partiéndolo en dos releases (añadir lo nuevo → migrar datos → borrar lo viejo). Si no es
viable, proceder así y **con la base respaldada**:

El orden exacto importa: **el respaldo de rollback se toma DESPUÉS de detener las escrituras**, nunca antes
(hallazgo 🔴 de Devin #99). Un snapshot tomado antes de la ventana no contiene lo que se escriba después, y
restaurarlo borraría esas transacciones. Por eso el *drill* de restauración se hace **antes**, pero con otro
snapshot; el artefacto que se restaura es el **final**, capturado ya en quiescencia.

**A. Preparación previa (días antes, sin tocar producción)**
- [ ] **Drill de restauración**: restaurar un snapshot en un entorno de prueba, conectarse y **cronometrar**
      (define el RTO real). Un respaldo que nunca se ha restaurado no es un plan de recuperación.
      ⚠️ Ese snapshot de práctica **no** es el que se usará para revertir: el de rollback se toma en la
      ventana (paso B.3).

**B. Ventana de mantenimiento (secuencia estricta, sin pausas intermedias)**
1. [ ] **Anunciar** la ventana (fuera de horario de operación) y avisar a los usuarios.
2. [ ] Poner la aplicación en **sólo lectura / mantenimiento** (nadie escribe).
3. [ ] **Detener las tareas programadas**: pausar el cron externo (§6) —y el *Cron Job* de Vercel si
       existe— para que `GET /api/payload-jobs/run?queue=alerts` no dispare escrituras a mitad del cambio.
4. [ ] **Drenar el trabajo en vuelo** y **verificar quiescencia de escrituras** antes de seguir. Con la
       conexión directa:
       ```sql
       SELECT pid, state, query FROM pg_stat_activity
       WHERE datname = current_database() AND state <> 'idle' AND pid <> pg_backend_pid();
       ```
       No debe quedar ninguna transacción de negocio activa (sólo sesiones inactivas).
5. [ ] **Tomar el snapshot FINAL de rollback**, ya con las escrituras detenidas. Éste —no el del drill— es
       el artefacto que se restaura si la promoción falla: al no haber escrituras posteriores, restaurarlo
       **no pierde ninguna transacción**. Anotar hora y nombre del snapshot.
6. [ ] `pnpm migrate` (conexión directa) y, **acto seguido y sin pausa**, promover el deployment.
7. [ ] Smoke post-deploy (§4) **con el servicio aún cerrado**; sólo si pasa, reabrir el tráfico y
       **reactivar el cron** (§6).
8. [ ] Si algo falla: **restaurar del snapshot final del paso 5** (no intentar arreglar el esquema a mano
       en caliente) y volver a desplegar el código anterior.
- [ ] Si la política de recuperación exige verificar **ese artefacto exacto** antes de confiar en él,
      hacer el restore de prueba del snapshot final **dentro** de la ventana y **con el servicio todavía
      cerrado**: es el único momento en que probarlo no abre la brecha que describe este hallazgo.

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

> 🔀 **El orden depende de la clasificación de §3.1** (esto responde al reporte Devin #99): con una
> migración **COMPATIBLE** basta volver el código; con una **INCOMPATIBLE** el esquema ya no soporta el
> código viejo, así que el código por sí solo **no** recupera el servicio.

**5.1 Si la migración fue COMPATIBLE (*expand-contract*)** — el caso habitual
1. **Revertir el código**: promover el deployment anterior en Vercel. El esquema expandido es tolerado por
   el código viejo, así que el servicio vuelve sin tocar la base.
2. Dejar el esquema como está (las columnas/tablas nuevas no molestan) y arreglar hacia adelante.

**5.2 Si la migración fue INCOMPATIBLE (rename / drop / cambio de tipo)**
1. **No** basta con volver el código: el esquema ya no tiene lo que el deployment anterior necesita.
2. **Opción preferida — avanzar**: desplegar una corrección/adapter que funcione con el esquema nuevo
   (es la vía más rápida y sin pérdida de datos).
3. **Si no hay salida hacia adelante**: restaurar el **respaldo verificado de §3.3.B** y volver a desplegar
   el código anterior. Es la última red, y por eso el respaldo se prueba ANTES de la ventana.

**5.3 Revertir el esquema** (sólo si de verdad hay que deshacer la migración):

> 🔴 **Regla dura (hallazgo de Devin #99):** `migrate:down` **nunca** se ejecuta mientras un deployment que
> **necesita** el esquema migrado está sirviendo tráfico. `migrate:down` puede eliminar columnas, tablas,
> valores de `enum` o restricciones que ese código usa, y sus peticiones fallarían hasta que se promueva otro
> deployment. La reversión es **siempre** un procedimiento con la escritura detenida y en este orden.

**A. Si la migración fue COMPATIBLE** (*expand-contract*):
1. **Promover primero el código anterior** (el que tolera el esquema viejo) y verificar el smoke (§4).
2. **Sólo después**, y sin ningún deployment que dependa de lo nuevo, evaluar `migrate:down`. Si el código
   viejo ignora las columnas/tablas nuevas, lo más seguro es **no revertir** y arreglar hacia adelante.

**B. Si la migración fue INCOMPATIBLE** (rename / drop / cambio de tipo) — con el servicio cerrado:
1. **Anunciar** la ventana y **entrar en mantenimiento** (sólo lectura).
2. **Detener el cron** (§6) y **drenar** el trabajo en vuelo (verificar quiescencia, §3.3.B paso B.4).
3. **Revertir el esquema**: `pnpm migrate:down` (conexión directa) o **restaurar el snapshot final** de §3.3.B.
4. **Promover el deployment anterior** —el que coincide con el esquema ya revertido— y esperar a que sirva.
5. **Smoke** (§4) y, sólo entonces, **reabrir el tráfico** y reactivar el cron.

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
- [ ] **Durante una ventana de mantenimiento** (§3.3.B / §5.3): **pausar el cron** para que el runner no
      escriba a mitad del cambio, y **reactivarlo** al reabrir el servicio.

---

## 7. Decisiones registradas (y por qué)

### 7.1 NO se embebe `payload migrate` en el build de Vercel
La documentación oficial de Payload propone `"ci": "payload migrate && pnpm build"`. **Aquí NO se aplica a
Vercel**, y es deliberado: Vercel ejecuta el *build* también en **cada preview**, y si el entorno
*Preview* tiene expuesta la base de producción (§7.4) se estaría ejecutando **DDL sobre la base de
producción desde código no revisado**. Las migraciones son un paso **explícito** (§3.3), desde la conexión
directa. En CI sí corre `pnpm migrate` (contra el Postgres desechable del runner), que es donde tiene sentido.

### 7.2 El DDL nunca por el pooler (6543)
Ver §1. Es un invariante de infraestructura, no una preferencia.

### 7.3 `migrate:status` informa, no bloquea
Ver §3.2. El repo **no** incluye un paso de CI con `migrate:status` porque sería decorativo (sale 0).
La guarda real anti-drift es `schemaMirror.test.ts` + `pnpm migrate` en CI.

### 7.4 🟥 Riesgo de seguridad: previews contra la base de PRODUCCIÓN
**El riesgo es real** (hallazgo 🟥 del reporte Devin #99): un *preview deployment* ejecuta **código no
fusionado ni revisado** contra la base a la que apunte, y puede **leer, alterar o borrar datos reales**
sin pasar por revisión. No es una decisión que convenga dejar "por defecto".

**Configuración SEGURA por defecto (recomendada): aislar la base por entorno en Vercel.**
En Vercel las variables se pueden acotar por entorno; el problema aparece cuando se crean "para todos
los entornos". Pasos:

1. **Vercel → Settings → Environment Variables**: editar `DATABASE_URI` y `DATABASE_DIRECT_URL` y dejar
   marcado **sólo `Production`** (quitar `Preview` y `Development`). Lo mismo para
   `PAYLOAD_SECRET`: compartirlo permitiría que un token emitido en un preview valide en producción.
2. Para que los previews sigan siendo útiles, crear un **proyecto Supabase de staging** y declarar sus
   `DATABASE_URI`/`DATABASE_DIRECT_URL` **sólo para `Preview`** (con sus migraciones aplicadas: §3.3).
3. Verificar el efecto: en un preview, `GET /api/health` debe devolver `200` con la base de staging, y
   **no** debe ver datos de clientes reales.
4. Si no se va a montar staging todavía, la alternativa honesta es **no exponer la base a `Preview`**
   (el preview fallará al conectar: es preferible a que escriba en producción).

> Consecuencia documentada de §7.1: como las migraciones **no** corren en el build de Vercel, un preview
> nunca aplica DDL — pero eso **no** impide que escriba filas de negocio. La contención es el aislamiento
> de la base, no la ausencia de migraciones.


---

## 8. Anti-patrones (lo que NO se hace)

- ❌ Correr `migrate` apuntando a producción **por el puerto 6543**.
- ❌ Editar a mano una migración ya aplicada (el `batch` en `payload_migrations` queda desincronizado).
- ❌ Añadir un archivo de migración sin registrarlo en `src/migrations/index.ts` (jamás se aplica).
- ❌ `migrate:reset` / `migrate:fresh` en producción.
- ❌ Depender de `migrate:status` como puerta de calidad.
- ❌ Poner `payload migrate` en el build de Vercel (ver 7.1).
- ❌ Confundir el proyecto Supabase: producción = **`empresarial-saas`** (`mzpqwaepkyhktfvgbxcq`).
- ❌ Dejar la base de **producción** expuesta al entorno *Preview* de Vercel (código no revisado escribiendo
      datos reales — §7.4).
- ❌ Compartir `PAYLOAD_SECRET` entre *Preview* y *Production* (un token emitido en un preview valdría en
      producción).
- ❌ Aplicar una migración **INCOMPATIBLE** mientras el deployment actual sigue sirviendo tráfico, sin
      ventana de mantenimiento ni respaldo probado (§3.3.B).
- ❌ Meter un `DROP`/`RENAME` en el mismo release que introduce el código que ya no usa esa columna
      (rompe *expand-contract*: usa dos releases).
- ❌ Creer que revertir el código restaura el servicio tras una migración **incompatible** (el esquema ya
      no le sirve — §5).
- ❌ Suponer que `migrate:down` es seguro porque «el código se puede volver a desplegar»: con un deployment
      que **requiere** el esquema migrado sirviendo tráfico, elimina columnas/tablas/`enum` que ese código
      usa (§5.3).
- ❌ Tomar el snapshot de rollback **antes** de detener las escrituras y usarlo después para restaurar:
      borra todo lo escrito en ese intervalo (§3.3.B).
- ❌ Correr la ventana de mantenimiento con el **cron** o los jobs en marcha (escriben durante el cambio).
- ❌ Confiar en un respaldo que **nunca se ha restaurado** en un entorno de prueba.

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


