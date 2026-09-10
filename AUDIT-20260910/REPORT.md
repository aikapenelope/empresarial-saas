# AUDITORÍA PROFUNDA — REPORTE CONSOLIDADO
**Empresarial SaaS · Payload 3.88.0 · Next 16.3.0 · Supabase · 2026-09-10 · HEAD `162bc64`**
**48,259 LOC TS/TSX · 233 archivos · 44 Server Actions · 3 plugins in-repo · 27 tests · 22 migraciones**

---

## 1. RESUMEN EJECUTIVO

**Empresarial SaaS es un sistema notablemente bien construido para su edad.** El core de Payload está intacto (cero hacks, 10 dependencias oficiales pinneadas, plugins in-repo 100% canónicos), la constitución §2.1 se cumple con disciplina inusual (cero violaciones de dirección), y los mecanismos de integridad (advisory locks ordenados, kardex inmutable idempotente, `runIsolatedContext`, transacciones en todo write multi-doc) son de nivel producción. La arquitectura demuestra aprendizajes reales documentados (cada suite de tests existe por una regresión Devin concreta).

**Los 5 riesgos principales:**
1. **2 CVEs de RCE no autenticado en next@16.3.0** (parche existe: 16.3.3) — el riesgo más grave y el más fácil de arreglar.
2. **CVE de account-unlock en Payload 3.88 SIN parche upstream** — cualquier usuario autenticado puede desbloquear cuentas ajenas; `Users.ts` no define `maxAttempts` ni `access.unlock`.
3. **Red de seguridad de BD incompleta**: `quotes` y `cash_closures` sin UNIQUE (tenant, número); cero CHECK constraints de invariantes.
4. **Carrera cierre de caja vs pago en vuelo** (find fuera de transacción) + costo ponderado que ignora reversos de anulación.
5. **Escalabilidad del dashboard**: `findAllDocs` carga colecciones completas del tenant para agregar en JS — se degrada linealmente y rompe el pool serverless con pocos usuarios concurrentes.

**Remediación total estimada: 2 sprints de reparación** (ver §4). Nada requiere re-arquitectura; todo son fixes localizados sobre una base sana.

---

## 2. SCORECARD (0-10)

| Dimensión | Score | Justificación breve |
|---|---|---|
| **Cumplimiento Payload** | **8.5** | Core intacto, 3/3 plugins canónicos, 43/43 hooks con `req`, 3 pitfalls cubiertos. Deuda: unlock CVE, importExport override de access. [SECTOR-0] |
| **Seguridad** | **7** | Aislamiento tenant 44/44 actions + fail-closed layout + rehidratación por request. Deuda: 2 RCE Next, unlock CVE, sin rate limit en exchange-rates, sin headers CSP. [SECTOR-1] |
| **Integridad de datos** | **7.5** | Locks ordenados, idempotencia por kardex, 9/9 numeración en transacción. Deuda: uniques faltantes (quotes/cajas), carrera cierre, costo ponderado sin reversos, sin CHECKs. [SECTOR-2] |
| **Robustez (edge cases)** | **7** | 14/20 edge cases del sistema manejados correctamente (doble anulación, stock insuficiente, producción concurrente). Abiertos: doble submit POS, tasa absurda/fallback 1.0, cierre con pago en vuelo. [SECTOR-2 §4] |
| **Arquitectura / acoplamiento** | **7.5** | Cero violaciones de dirección, grafo limpio UI→actions→utilities→BD. Deuda de tamaño: 2 archivos dios (3,524 + 2,137 LOC), duplicación estructural. [SECTOR-3] |
| **Calidad de código** | **7** | TS estricto real, comentarios explicativos valiosos, 25 casts clasificados (7 eliminables gratis). 1 warning de lint. [SECTOR-3 §5] |
| **Rendimiento** | **6** | depth disciplinado, revalidatePath específico, cache de tasas. Killer: findAllDocs (6 colecciones full-scan por dashboard), depth:2 en BOM. [SECTOR-4] |
| **Tests** | **5** | 27 tests de ALTA calidad (comportamiento, no implementación) pero 90% de dominios sin red: pagos, compras, cajas, POS, numeración, multi-tenant = 0. [SECTOR-5] |
| **Readiness producción** | **6.5** | CI serio con Postgres real; faltan audit gate + build gate + Sentry + 2 vars de env sin documentar. [SEADOR-5] |
| **SCORE GLOBAL DEL SISTEMA** | **7/10** | Base de código encima del promedio con deuda concentrada y localizable — lista para producción tras 2 sprints de reparación. |

---

## 3. TABLA CONSOLIDADA DE HALLAZGOS (34)

### P0/P1 — Blockers de producción (8)

| ID | Sector | Hallazgo | Riesgo negocio | Esfuerzo |
|---|---|---|---|---|
| P1-S1-01 | S1 | next@16.3.0 vulnerable a 2 RCE no autenticados (parche 16.3.3) | Compromiso total del sistema | **S** |
| P1-S0-01 / P1-S1-02 | S0/S1 | CVE Payload account-unlock SIN parche: Users.ts sin maxAttempts ni access.unlock — cualquier usuario autenticado desbloquea cuentas ajenas | Brute-force facilitado sobre super-admin | **S** |
| P1-S2-01 | S2 | quotes y cash_closures sin UNIQUE (tenant, número) | Números duplicados definitivos | **S** (migración) |
| P1-S2-02 | S2 | createCashClosureAction: find fuera de transacción, update sin lock — pago en vuelo queda fuera del arqueo | Arqueos con descuadres falsos | **M** |
| P1-S2-03 | S2 | Costo ponderado ignora reversos (sale_return con costo 0) | COGS y márgenes distorsionados tras anulación | **M** |
| P1-S4-01 | S4 | findAllDocs: dashboards RSC cargan 6 colecciones completas por render | Timeouts serverless con ~5-10k docs/tenant | **M** |
| P1-S5-01 | S5 | Cero tests en flujos de dinero: pagos, compras, cajas, POS, numeración | Sin red de regresión en el dominio crítico | **M-L** |
| (P0: ninguno — ninguno rompe hoy) | | | | |

### P2 — Graves / antes del lanzamiento si hay volumen (17)

| ID | Sector | Hallazgo | Esfuerzo |
|---|---|---|---|
| P2-S1-01 | S1 | /api/exchange-rates?refresh sin rate limit (DoS a APIs externas) | S |
| P2-S1-02 | S1 | Tasas externas sin sanity bounds superiores | S |
| P2-S1-03 | S1 | resolveEffectiveRate fallback silencioso a tasa 1.0 | M |
| P2-S1-04 | S1 | csv-parse vulnerable vía plugin oficial (upstream) | S (tracking) |
| P2-S1-05 | S1 | Sin security headers (CSP/HSTS/X-Frame) | S |
| P2-S0-01 | S0 | Sin test de contrato del guard requireErpTenantAccess | S |
| P2-S0-02 | S0/S4 | Queries sin `select` en listados | M |
| P2-S0-03 | S0 | importExportPlugin REEMPLAZA access de 4 colecciones (no compone) | S |
| P2-S2-01 | S2 | Sin CHECK constraint stock >= 0 en BD | M |
| P2-S2-02 | S2 | Numeración manual desde admin salta la secuencia (FAC-99999) | S |
| P2-S2-03 | S2 | ensureWalkInCustomer find-or-create con carrera (duplicados) | S |
| P2-S2-04 | S2 | Anulación de factura con pagos previos: política de devolución no modelada | M |
| P2-S3-01 | S3 | Archivos dios erpActions/erpData | M (por etapas) |
| P2-S3-02/03/04 | S3 | Duplicación helpers ledger · casts user.tenants gratis · 20 modales repetidos | S/M |
| P2-S4-02/03 | S4 | BOM depth:2 · quotes sin ventana temporal en dashboard | S |
| P2-S5-01/02 | S5 | CI sin audit gate ni build gate | S |
| P2-S5-03/04 | S5 | .env.example sin PUBLIC_BASE_URL/RESEND_API_KEY · sin Sentry | S |

### P3 — Post-launch (9)

P3-S0-01 (price-history access explícito), P3-S1-01 (middleware belt-and-suspenders), P3-S1-02 (CA bundle doc), P3-S2-01 (estilo updateOrder), P3-S3-01/02/03 (código muerto, consts duplicadas, paginación compras/pagos), P3-S4-01 (índices compuestos opcionales), P3-S5-01 (tests de concurrencia).

---

## 4. PLAN DE SPRINTS DE REPARACIÓN

> Diseñado para el ciclo §5.2 del repo: implementar → validación local verde → UN push → PR → terminar turno.
> Cada sprint = UN PR agrupado. Orden por riesgo/ROI.

### SPRINT R1 — "Blindaje de seguridad y BD" (todo esfuerzo S, ~2-3 días)
**Objetivo: cerrar los 3 blockers de seguridad/integridad más baratos.**
1. **Bump `next` → 16.3.3+** (P1-S1-01) + `sharp` → 0.35.4+ si es compatible (P2-S1-04 parcial). Validar `payload build`.
2. **Users.ts**: `auth: { maxAttempts: 5, lockTime: 30*60*1000 }` + `access.unlock: () => false` (P1-S0-01/S1-02) + test de que un usuario no-admin no puede unlock.
3. **Migración unique constraints**: `quotes (tenant_id, quote_number)` + `cash_closures (tenant_id, closure_number)` (P1-S2-01).
4. **CI**: añadir step `pnpm audit --audit-level high` (falla el PR con vulns high/critical nuevas) + step `pnpm build` (P2-S5-01/02).
5. **.env.example**: añadir `PUBLIC_BASE_URL`, `RESEND_API_KEY` (P2-S5-03).
6. **Sanity bounds de tasas** (P2-S1-02) + rate limit simple en `/api/exchange-rates` refresh (P2-S1-01) + security headers en next.config (P2-S1-05).
7. **Test de contrato del guard**: lint rule o test AST — toda `export async function *Action` debe llamar requireErp* (P2-S0-01).

**Criterio de salida:** `pnpm audit` sin critical; CI verde con los 2 nuevos gates; migración aplicada.

### SPRINT R2 — "Integridad del dinero" (~4-5 días)
**Objetivo: cerrar las carreras y distorsiones contables.**
1. **createCashClosureAction**: mover find+update a `withTransaction` + `SELECT ... FOR UPDATE` del closure (P1-S2-02).
2. **Costo ponderado con reversos**: `revertSaleFromInventory` usa el costo snapshot de la venta original (de `invoice.items.unitCostUSD` o el costo al momento del sale_out) en vez de 0 (P1-S2-03).
3. **Fallback de tasa**: autoSync sin fuentes + sin manual ⇒ rechazar emisión en vez de rate 1.0 (P2-S1-03).
4. **CHECK constraint** `products.current_stock >= 0` (P2-S2-01) + política de anulación con pagos previos: exigir devolución primero (P2-S2-04).
5. **Walk-in con advisory lock** (P2-S2-03) + readOnly de invoiceNumber en admin panel (P2-S2-02).
6. **Suite de integración de pagos CxC** (primer bloque de P1-S5-01): createPayment allocations, IGTF, sobrepago, anulación con pagos.

**Criterio de salida:** test de cierre de caja con pago concurrente simulado pasa; suite de pagos en verde.

### SPRINT R3 — "Escala del dashboard" (~3-4 días, puede esperar si el volumen es bajo)
1. **Agregaciones SQL para KPIs** del dashboard (P1-S4-01): SUM/COUNT group by — reutilizando el patrón `db.execute` de inventoryLedger.
2. **Window 60d al where de quotes** en getDashboardData (P2-S4-03) + BOM depth 1 (P2-S4-02).
3. **Consolidar findAllDocs/findAllMatching** en un único helper `paginatedFetch` (preparación de Sector 3).

### SPRINT R4 — "Limpieza estructural" (opcional, post-producción)
1. Split erpActions/erpData por dominio con re-exports (P2-S3-01).
2. Consolidar extractId/getUserTenantIds/db-adapter-type (P2-S3-02) + eliminar 7 casts gratis (P2-S3-03).
3. ModalForm genérico (P2-S3-04) + delete INVOICE_SHARE_BLOCKED + componer access del importExport (P2-S0-03).
4. Suites de integración: compras, cajas, numeración concurrente (resto de P1-S5-01).

---

## 5. MÉTRICAS BASE (para la próxima auditoría)

| Métrica | Valor 2026-09-10 |
|---|---|
| LOC TS/TSX (src) | 48,259 |
| Archivos | 233 |
| Server Actions | 44 (41 erp + 3 share) |
| Plugins in-repo canónicos | 3/3 |
| Hooks con `req` propagado | 43/43 |
| Casts `as unknown as` | 25 (7 eliminables) |
| Vulnerabilidades | 11 (2 critical, 2 high, 5 moderate, 2 low) |
| Tests | 27 (21 unit + 6 integración) |
| Warning de lint | 1 |
| Migraciones | 22 |
| Archivos >1k LOC | 3 (erpActions, payload-types, erpData) |
| UNIQUE (tenant, número) | 7/9 colecciones |
| withTransaction en actions multi-doc | 32/32 verificadas |
| Edge cases manejados | 14/20 |

## 6. RECOMENDACIÓN FINAL

**El plan de sprints completo, validado fix por fix contra los docs oficiales de Payload 3.88 (Context7), está en `SPRINTS-REPARACION.md`** — R1 (seguridad+BD) y R2 (integridad del dinero) son los blockers de producción; R3 (escala del dashboard) según volumen; R4 (limpieza) post-launch. Nota de la validación: la propiedad oficial es `maxLoginAttempts` (corregido en SECTOR-0/1); las columnas de lockout ya existen en BD (fix sin migración); el peer range de `@payloadcms/next` acepta el bump 16.3.3. El sistema tiene una base excepcional — el plan no toca arquitectura, solo ciega huecos localizados con API 100% oficial.

---

**Detalle por sector:** SECTOR-0-PAYLOAD-CORE.md · SECTOR-1-SEGURIDAD-MULTITENANCIA.md · SECTOR-2-INTEGRIDAD-DATOS.md · SECTOR-3-ARQUITECTURA-CALIDAD.md · SECTOR-4-RENDIMIENTO-ESCALA.md · SECTOR-5-TESTS-CI-READINESS.md
