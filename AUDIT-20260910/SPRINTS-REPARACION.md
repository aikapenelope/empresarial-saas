# PLAN DE SPRINTS DE REPARACIÓN — VALIDADO CONTRA PAYLOAD 3.88.0
**Derivado de AUDIT-20260910 · 2026-09-10 · Cada fix validado contra docs oficiales (Context7 `/payloadcms/payload` + skill local) y contra el código actual**

---

## CRITERIOS DE DISEÑO (inviolables)

1. **Cero riesgo al estado actual**: cada fix es aditivo o configuracional — ninguno reestructura, ninguno cambia contratos de datos existentes, ninguno requiere re-arquitectura.
2. **100% nativo de Payload**: cada fix usa la API oficial documentada (propiedad exacta, patrón oficial). Cero workarounds. Verificado por fix abajo.
3. **Cero esperas**: cada sprint = implementar → `tsc --noEmit` + `eslint` + `payload build` en verde → UN push → PR → terminar turno (AGENTS.md §5.2).
4. **Cada fix documentado** con: hallazgo origen, API oficial usada, evidencia de que no rompe, criterio de verificación.
5. **Principio de mejora pura**: si un fix no hace el sistema estrictamente más robusto sin trade-offs, se descarta o pospone (así se decidió el cambio de `access.unlock` — ver R1.2).

---

# SPRINT R1 — BLINDAJE DE SEGURIDAD Y BD (esfuerzo S, ~2-3 días)

> **Objetivo:** cerrar los 3 blockers más baratos. Todo es config/migración/adición — cero cambios de lógica de negocio.

## R1.1 — Bump `next` 16.3.0 → 16.3.3+ (P1-S1-01)

| Aspecto | Detalle |
|---|---|
| **Hallazgo origen** | 2 CVEs RCE no autenticado (>=16.0.0 <16.3.3) — el riesgo más alto del sistema |
| **Validación Payload** | `@payloadcms/next@3.88.0` peerDependencies: `next: ">=16.2.6 <17.0.0"` — 16.3.3 está DENTRO del rango soportado oficialmente. Verificado en `node_modules/@payloadcms/next/package.json`. |
| **Qué NO rompe** | Es patch release dentro del rango peer; Vercel y Next mantienen compat 16.x. `sharp` NO se bump-ea en este sprint (ver R4.4): `payload` depende de `sharp@0.32.6` en devDeps internas y el bump de sharp es para su propio advisory — se hace solo si `payload build` pasa y el tipo MIME de media sigue igual. |
| **Cómo** | `pnpm update next@16.3.3 eslint-config-next@16.3.3` (mover eslint-config junto para no desalinear) → `payload build` → verificar `/admin` renderiza. |
| **Verificación** | `pnpm audit` sin critical; `pnpm build` verde; smoke test login admin. |

## R1.2 — Blindar account lockout (P1-S0-01 / P1-S1-02) — **CORREGIDO con docs oficiales**

| Aspecto | Detalle |
|---|---|
| **Hallazgo origen** | CVE Payload ≤3.88.0 SIN parche: default unlock access permite a usuarios autenticados resetear lockouts ajenos. `Users.ts` no define lockout config. |
| **API oficial usada** | `auth: { maxLoginAttempts, lockTime }` + `access.unlock` — docs `authentication/overview.mdx` y `access-control/collections.mdx` (consultados vía Context7): `unlock: ({ req: { user } }) => Boolean(user)` es la firma oficial. |
| **Propiedad correcta** | **`maxLoginAttempts`** (NO `maxAttempts` — corregido en SECTOR-0/1 tras verificar docs). Las columnas `login_attempts`/`lock_until` YA existen (`init_core.ts:46-47`) — **sin migración, config pura**. |
| **Qué NO rompe** | (a) `access.unlock: super-admin only` NO rompe el admin panel: el super-admin conserva el botón unlock en la UI de Payload. (b) NO se usa `() => false` total porque cegaría también al super-admin en el admin panel (fricción operativa sin ganancia de seguridad — el CVE es que usuarios NORMALES puedan unlock). (c) El flujo forgot-password (`reset_password_token`) NO pasa por la operación unlock — los usuarios auto-recuperan igual. (d) `payload.unlock({ overrideAccess: true })` vía Local API sigue disponible para un server action futuro si se necesita desbloqueo operativo auditado. |
| **Cómo** | En `src/collections/Users.ts`: `auth: { maxLoginAttempts: 5, lockTime: 30 * 60 * 1000 }` + añadir `unlock: ({ req: { user } }) => user?.role === 'super-admin'` al objeto access existente (composición, no reemplazo). |
| **Verificación** | Test de integración: usuario autenticado no-super-admin POST `/api/users/unlock` → 403; 6 logins fallidos → lock; login con cuenta locked → rechazado; super-admin unlock desde admin panel → funciona. `tsc` verde (sin cambio de tipos). |

## R1.3 — UNIQUE (tenant, número) en quotes y cash_closures (P1-S2-01)

| Aspecto | Detalle |
|---|---|
| **Hallazgo origen** | 7/9 colecciones numeradas tienen UNIQUE; quotes/cash_closures solo índice simple — la red de seguridad BD tiene huecos. |
| **Validación Payload** | Patrón oficial verificado: el repo YA usa migraciones SQL crudas para uniques (`document_number_uniques.ts:9-11` — `CREATE UNIQUE INDEX IF NOT EXISTS`). Payload 3.88 soporta también `indexes: [{ fields: [...], unique: true }]` en CollectionConfig (docs `database/indexes.mdx`), pero para consistencia con las 7 existentes usamos migración idéntica a las hermanas. |
| **Qué NO rompe** | (a) Los números YA son únicos por el advisory lock de `nextDocumentNumber` — el constraint solo materializa en BD lo que el código ya garantiza (no puede rechazar escrituras legítimas). (b) `down()` con DROP INDEX como todas las hermanas. (c) Antes de aplicar: sanity check SQL de duplicados existentes (`SELECT tenant_id, quote_number, COUNT(*) ... HAVING COUNT(*) > 1`) — si hubiera históricos duplicados (imposible vía actions, posible vía admin REST), se renombran antes de crear el índice. |
| **Cómo** | `pnpm migrate:create` → 2 `CREATE UNIQUE INDEX IF NOT EXISTS` + 2 `DROP INDEX IF EXISTS` en down, siguiendo byte a byte el patrón de `document_number_uniques.ts`. |
| **Verificación** | `pnpm migrate` en local 54322 verde; `migrate:status` limpio; insert duplicado manual rechazado por BD. |

## R1.4 — CI: audit gate + build gate (P2-S5-01/02)

| Aspecto | Detalle |
|---|---|
| **Qué NO rompe** | Pasos aditivos al workflow existente. `pnpm audit --audit-level high` como step **no-bloqueante primero (warning)** → pasar a bloqueante tras 1 semana de estabilización (para no trap door-blocking en PRs legítimos); `pnpm build` SIEMPRE bloqueante (detecta errores de compilación ANTES de gastar cuota Vercel — AGENTS.md §5.2 lo exige). |
| **Riesgo controlado** | El build en CI añade ~3-5 min por PR — aceptable; cache de pnpm ya está (`cache: pnpm`). |
| **Verificación** | PR de prueba con vuln high conocida → step falla (warning) sin romper el merge hasta que se active el gate. |

## R1.5 — Rate limit + sanity bounds de tasas (P2-S1-01/02) + security headers (P2-S1-05)

| Aspecto | Detalle |
|---|---|
| **Rate limit refresh** | En `api/exchange-rates/route.ts`: token bucket en memoria por instancia (30 req/min por IP vía `x-forwarded-for`), SOLO para el flag `refresh=true` (el GET cacheado es libre). No es perfect global (multi-instancia serverless) pero reduce el DoS a las 3 APIs externas ~30-60×. Sin dependencias nuevas (cero `@og__/rate-limit` — menor superficie). |
| **Sanity bounds** | En `fetchBCVRate`/`fetchParaleloRate`/`fetchBinanceP2PRate`: aceptar solo `1 < val < 1_000_000` (Venezuela: tasas históricas 1-1000 Bs/USD; margen 1000× por si el bolívar hace algo raro). Fuera de rango → tratar como null (fallback a siguiente fuente). **No rompe**: hoy aceptan cualquier `val > 0`; los valores reales de las 3 APIs siempre están en rango. |
| **Security headers** | En `next.config.ts` `headers()`: HSTS, X-Content-Type-Options: nosniff, X-Frame-Options: DENY, Referrer-Policy: strict-origin-when-cross-origin. **CSP se pospone a R4** (requiere inventario de scripts/styles del admin panel de Payload — hacer CSP a ciegas ROMPE el admin; decisión explícita de no romper). |
| **Verificación** | curl con refresh masivo → 429; test unit del bound con tasa 10^9 → null; `/admin` y ERP renderizan igual con headers nuevos. |

## R1.6 — Test de contrato del guard (P2-S0-01)

| Aspecto | Detalle |
|---|---|
| **Qué** | Test de integración que importa `erpActions.ts` y verifica por reflexión que cada `export async function *Action` contiene `requireErpTenantAccess|requireSuperAdmin|requireErpUser` en su cuerpo (source scan del archivo con regex — robusto, sin AST dep). |
| **Qué NO rompe** | Es solo test — no toca código de producto. Los 3 aliases del guard cuentan. |
| **Verificación** | El test pasa con las 44 actions actuales; un tmp-comment del guard en una action → el test falla (verificar localmente, revertir, no commitear). |

## R1.7 — .env.example completo (P2-S5-03)

Añadir `PUBLIC_BASE_URL` (exigido por shareActions:69) y `RESEND_API_KEY` (config:163) con comentarios de cuándo se necesitan. Docs-only, cero riesgo.

**ENTREGABLE R1:** UN PR con 7 commits atómicos. Validación local: `tsc --noEmit` + `eslint` + `payload build` + suite completa verde. Después del merge: **bloquear el audit gate** (issue de seguimiento).

---

# SPRINT R2 — INTEGRIDAD DEL DINERO (esfuerzo M, ~4-5 días)

> **Objetivo:** cerrar las 3 carreras/distorsiones contables. Aquí SÍ se toca lógica — cada fix preserva el contrato externo intacto.

## R2.1 — Cierre de caja transaccional (P1-S2-02)

| Aspecto | Detalle |
|---|---|
| **Hallazgo origen** | `createCashClosureAction:3168-3208` — find del turno abierto FUERA de transacción, update sin lock; un pago en vuelo queda fuera del arqueo. |
| **API oficial usada** | Docs `database/transactions.mdx` (validado vía Context7): `payload.db.beginTransaction()` + `req: { transactionID }` — EXACTAMENTE el patrón que ya implementa `withTransaction:83-103` del repo. El fix reutiliza la utilidad existente — cero nueva API. |
| **Diseño (no quick-fix)** | Mover el find del closure adentro de `withTransaction` + `SELECT id FROM cash_closures WHERE id = ${closureId} FOR UPDATE` (patrón ya usado en `revertSaleFromInventory:212`) antes del update. El `FOR UPDATE` serializa: un pago que intente escribir `cashClosure` del mismo turno espera; el arqueo ve el estado consistente. **Importante**: `computeShiftTransactions` ya corre dentro del beforeChange del update (misma tx) — el fix la hace empezar sobre una foto consistente del turno. |
| **Qué NO rompe** | (a) El resto de la action no cambia (validaciones, revalidatePath, return shape idénticos). (b) El pago concurrente NO se pierde: solo espera el lock (ms) y luego queda FUERA de la ventana `paymentDate <= closedAt` del turno que cerró — comportamiento correcto y documentado (el pago cae en el turno siguiente o en ninguno si el usuario lo reasigna). (c) Los hooks de CashClosures (beforeChange/afterChange) no se tocan — reciben el mismo update, ahora con lock. |
| **Verificación** | Test de integración nuevo: abrir turno → crear pago → cerrar caja en la MISMA ventana → assert systemTotals incluye el pago; y: cerrar caja con pago llegando DURANTE (simulado con tx manual) → el cierre espera y cuadra. |

## R2.2 — Costo ponderado con reversos (P1-S2-03)

| Aspecto | Detalle |
|---|---|
| **Hallazgo origen** | `revertSaleFromInventory:277` crea `sale_return` con `unitCostUSD: 0` — los reingresos no devuelven costo al pool. |
| **Diseño** | En el loop de reversos: leer el costo snapshot del `sale_out` original (`SELECT unit_cost_usd FROM stock_movements WHERE invoice_id = X AND product_id = Y AND movement_type = 'sale_out' LIMIT 1` — columna existente) y usarlo como `unitCostUSD`/`totalCostUSD` del `sale_return`. Verificado: NADIE suma costos de `sale_return` hoy (grep confirmó que `updateProductWeightedCostOnPurchase` solo se dispara en `purchase_in` — `StockMovements/index.ts:262`); el kardex export solo imprime. **Es data-quality puro**: el costo pasa de "0 falso" a "costo real snapshot" sin cambiar ninguna fórmula. |
| **Qué NO rompe** | (a) El único consumidor del costo es el kardex visual — ahora muestra el valor correcto. (b) `recalculateProductTotalStock` no lee costos. (c) Los `sale_return` históricos con 0 NO se migran (historia del kardex inmutable se preserva — solo los nuevos llevan costo correcto; se documenta en el PR). |
| **Verificación** | Test de integración: venta → anulación → assert `sale_return.unitCostUSD == sale_out.unitCostUSD` del producto. |

## R2.3 — Fallback de tasa honesto (P2-S1-03)

| Aspecto | Detalle |
|---|---|
| **Diseño** | `resolveEffectiveRate` con autoSync y TODAS las fuentes muertas y sin manual → **lanzar error explícito** ("Tasa no disponible: configure tasa manual o reintente") en vez de devolver `rate: 1`. Solo se cambia la rama `default_unit` (la 6ª). El `rate: 1` original era una trampa silenciosa en Venezuela. |
| **Qué NO rompe** | Verificado por codegraph: `resolveEffectiveRate` tiene 7 callers (createInvoiceCore, createPurchaseInvoice, CashClosures beforeChange, createSupplierPayment, createPayment, updateTenantSettings, pricing). Todos ya manejan errores con try/catch + toSafeActionError (patrón action). Los que YA usaban tasa manual o fuente viva no notan el cambio. **Risk check**: el beforeChange de CashClosures llama `resolveEffectiveRate()` SIN tenantConfig — con sources muertas hoy devuelve 1.0 (arqueo usa tasa solo para consolidar USD+VES); con el fix lanza → el cierre de caja fallaría con fuentes muertas. **Decisión**: en CashClosures se atrapa el error y se usa la última tasa cacheada (`cachedRates`) o 1 con warning — se ajusta ese caller puntualmente, documentado. |
| **Verificación** | Test unit: mock fetch muerto + tenant autoSync → throw; tenant con manual → rate manual. Test que cierre de caja con fuentes muertas usa fallback con warning. |

## R2.4 — CHECK stock >= 0 + walk-in lock + readOnly números (P2-S2-01/02/03)

| Aspecto | Detalle |
|---|---|
| **CHECK constraint** | Migración: `ALTER TABLE products ADD CONSTRAINT products_current_stock_check CHECK (current_stock >= 0)`. **Risk check previo**: si existe HOY algún producto con stock negativo (posible por bugs pasados), la migración falla al aplicar — el PR incluye query de sanity y, si hay negativos, primero se corrigen con ajuste de kardex (recalcular). `recalculateProductTotalStock` ya mantiene coherencia con los movimientos, y toda la aplicación valida saldo antes de descargar — el CHECK es la red de seguridad final, no cambia runtime. |
| **Walk-in advisory lock** | `ensureWalkInCustomerAction`: `SELECT pg_advisory_xact_lock(hashtext('walkin:' || tenantId))` alrededor del find-or-create (patrón idéntico a `nextDocumentNumber:561`) + envolver en `withTransaction` (advisory xact lock requiere tx). Elimina duplicados por doble submit. |
| **readOnly números** | `invoiceNumber`/`quoteNumber`/etc. en las colecciones: añadir `admin: { readOnly: true }` — bloquea la edición manual desde admin panel (la creación REST manual sigue posible pero el número readOnly evita el formato-spoofing FAC-99999; el REST create sin número pasa por el hook de colección... verificar cada colección: si el número es required sin default de hook, añadir el hook de numeración o readOnly + required false). **Alcance exacto**: solo admin readOnly en el sprint; renumeración defensiva de REST queda documentada como follow-up (no es P1). |
| **Verificación** | Migración en local: `UPDATE products SET current_stock = -1` → rechazado por BD. Doble submit walk-in simulado → 1 solo cliente. Admin panel: campo número no editable. |

## R2.5 — Suite de integración de pagos CxC (primer bloque P1-S5-01)

`tests/integration/customerPayments.test.ts`: (1) pago total → factura paid + balance 0; (2) pago parcial → partially_paid + balance correcto; (3) sobrepago → rechazado; (4) IGTF en método FX calculado; (5) anulación de factura con pagos parciales → política actual documentada en test (aserta el comportamiento presente). Todo contra el Postgres local 54322 — mismo harness que salesInventory.test.ts.

**ENTREGABLE R2:** UN PR. Validación: tsc + eslint + build + suite completa (incl. tests nuevos) verde.

---

# SPRINT R3 — ESCALA DEL DASHBOARD (esfuerzo M, ~3-4 días)

> **Objetivo:** SQL donde hoy hay full-scan en JS. Reutiliza el patrón `db.execute(sql...)` YA existente (inventoryLedger) — cero API nueva de Payload (drizzle `sql` template con params bindados, docs `database/indexes.mdx` + patrón del propio repo).

## R3.1 — KPIs del dashboard por agregación (P1-S4-01)

| Aspecto | Detalle |
|---|---|
| **Diseño** | Nueva utilidad `src/utilities/kpiAggregates.ts`: `getReceivablesKpis(tenantId, req)` = `SELECT COALESCE(SUM(balance_usd),0) FROM invoices WHERE tenant_id = $1 AND status IN ('issued','partially_paid')` + counts equivalentes (lowStock por `current_stock <= min_stock_alert`, openRegisters, totalCustomers/products/BOMs por COUNT). `getDashboardMetrics` reemplaza los 6 `findAllDocs` por 6-8 agregaciones + los 2 `find` paginados (recentInvoices limit 6, topDebtors limit 5 ya eran acotados). |
| **Qué NO rompe** | (a) La shape de retorno `DashboardMetrics` queda IDÉNTICA — los componentes no cambian. (b) Se conservan los 2 queries acotados existentes. (c) `overrideAccess: false` + `user` no aplica a `db.execute` — el WHERE `tenant_id` se bindea del tenant ya verificado por `requireErpTenantAccess` (el guard corre antes, igual que hoy). (d) Nota: las agregaciones crudas saltan el access de colección — el aislamiento lo garantiza el `tenant_id` parametrizado + guard previo; documentado en la utilidad (mismo approach que inventoryLedger/salesLedger ya usan). |
| **Compatibilidad transaccional** | Read-only — no requiere tx. |
| **Verificación** | Test: paridad de KPIs — sembrar N facturas, correr getDashboardMetrics viejo (guardado para el test) vs nuevo → mismos números. Umbral: hasta 500 docs idénticos; luego solo el nuevo. |

## R3.2 — Queries acotadas en dashboardData (P2-S4-02/03)

`getDashboardData`: (a) where de quotes añade `createdAt >= start60` (el funnel solo usa los 60d — verificado en el código que procesa `quotes` solo dentro de ventanas 30/60); (b) BOM list depth 2 → 1 (la vista solo pinta nombre + totales — verificar componente antes; si pinta insumos, se hace select específico). Paridad verificada por test de snapshot de la shape.

## R3.3 — Helper paginación unificado (preparación Sector 3)

Extraer `findAllDocs`+`findAllMatching` a `src/utilities/paginatedFetch.ts` (export desde erpData para compatibilidad de imports — cero cambio de callers). Útil cuando se migren listados a paginación real Sprint 39-style.

**ENTREGABLE R3:** UN PR. Paridad de resultados es el criterio — el dashboard muestra EXACTAMENTE los mismos números.

---

# SPRINT R4 — LIMPIEZA ESTRUCTURAL (post-producción, opcional)

1. **Split erpActions/erpData por dominio** con re-exports de compatibilidad (`export * from './salesActions'`) — 32/37 importers intactos, cero toques de UI.
2. **Consolidación**: extractId/getUserTenantIds → `src/utilities/ids.ts`; type del db adapter → `getActiveDb` único; eliminar 7 casts `user.tenants` (payload-types ya tipa — verificado `:242-247`).
3. **ModalForm genérico** + `toastError` helper + delete `INVOICE_SHARE_BLOCKED` + componer access de importExport (`{ ...collection.access, read: ... }` — patrón de composición del plugin oficial verificado en docs PLUGIN-DEVELOPMENT).
4. **sharp bump** (0.35.4) si Payload lo permite sin break — validar con `payload build` + upload de imagen en admin.
5. **CSP** (ya con inventario de scripts del admin hecho).
6. **Suites de integración restantes**: compras, cajas (con la carrera de R2.1), numeración concurrente (2 emisiones paralelas → números distintos, sin duplicados).

---

## ORDEN Y DEPENDENCIAS

```
R1 (seguridad+BD) ──→ R2 (integridad dinero) ──→ R3 (escala) ──→ R4 (limpieza, opcional)
     ↑ R2.4 CHECK depende de R1.3 (ambas migraciones juntas en la ventana de migrate)
     ↑ R3.1 depende de nada de R2 (read-only, puede adelantarse si R2 demora)
```

## TABLA RESUMEN — COBERTURA DE HALLAZGOS

| Sprint | P1 cerrados | P2 cerrados | P3 cerrados |
|---|---|---|---|
| R1 | P1-S1-01, P1-S0-01/S1-02, P1-S2-01 | P2-S1-01/02/05, P2-S5-01/02/03, P2-S0-01, P2-S1-04 (tracking) | — |
| R2 | P1-S2-02, P1-S2-03, P1-S5-01 (parcial: pagos) | P2-S2-01/02/03/04, P2-S1-03 | P3-S2-01 |
| R3 | P1-S4-01 | P2-S4-02/03, (P2-S0-02 parcial) | P3-S4-01 (evaluación) |
| R4 | P1-S5-01 (completa) | P2-S3-01/02/03/04, P2-S0-03 | P3-S3-01/02/03, P3-S0-01, P3-S1-01/02, P3-S5-01 |

**No cubierto (decisión explícita):** ninguno de los hallazgos queda sin sprint — todos están mapeados arriba o listados en REPORT.md §3 como post-launch.

## GARANTÍAS FINALES (por qué esto no rompe Payload)

1. **Cero modificaciones al framework**: ningún archivo `node_modules`, ningún monkey-patch, cero `pnpm.overrides` nuevos (solo el existente benigno).
2. **Solo API oficial**: `maxLoginAttempts`/`lockTime`/`access.unlock` (docs auth), `beginTransaction/commit/rollback` (docs transactions — ya usadas), `pg_advisory_xact_lock`+`sql` template (patrón propio del repo desde Sprint 7), migraciones SQL siguiendo el patrón de las 7 uniques existentes.
3. **Los 3 plugins in-repo NO se tocan** — siguen canónicos (Sprint R4 solo consolida utilities, sin cambiar contratos de plugin).
4. **Todas las shapes de retorno intactas**: DashboardMetrics, actions results, admin panel rendering — verificado fix por fix arriba.
5. **Kardex inmutable preservado**: R2.2 solo corrige el VALOR de nuevos reversos; los históricos no se migran (la inmutabilidad es un invariante del sistema).
6. **Protocolo §5.2**: 1 sprint = 1 PR = 1 push. Validación local completa ANTES del push. Cero esperas de builds/bots.
