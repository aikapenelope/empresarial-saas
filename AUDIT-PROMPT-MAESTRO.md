# PROMPT MAESTRO — Auditoría Profunda "Empresarial SaaS" (Payload 3.88 · Next 16.3 · Supabase)

> Uso: pega este prompt completo en un agente nuevo (o por partes, un sector por turno).
> Cada sector es auto-contenido: arranca re-leyendo CONTEXTO DEL PROYECTO.
> Cada sector termina con un informe autónomo con evidencia `archivo:línea`.
> La auditoría es de LECTURA: prohibido modificar código de producto. Solo escribe en `AUDIT-<fecha>/`.

---

## MAPA DE SKILLS — cuál cargar en cada momento

| Momento | Skill a cargar | Por qué |
|---|---|---|
| **SECTOR 0 (todo)** | `payload` (in-repo: `.agents/skills/payload/`) | ES el estándar: patrón canónico de plugins, 3 Security Pitfalls, 11 Common Gotchas, Best Practices, y 11 docs de referencia (ACCESS-CONTROL, HOOKS, ADAPTERS, PLUGIN-DEVELOPMENT, QUERIES). **Contiene edge cases explícitos**: ACCESS-CONTROL-ADVANCED.md §"Test Edge Cases" (no user / wrong user / admin), HOOKS.md §context (loops), ADAPTERS.md §threading-req. |
| **SECTOR 1** | `security-and-hardening` + `code-security` | STRIDE threat model + reglas OWASP TS/JS. |
| **SECTOR 2** | `payload` (§transacciones) + `supabase-postgres-best-practices` | Locks `FOR UPDATE`/advisory, invariantes en BD, concurrencia. |
| **SECTOR 3** | `thermo-nuclear-code-quality-review` + `codebase-design` | Revisión brutal de mantenibilidad + vocabulario de módulos profundos/acoplamiento ("cómo se hablan las cosas"). |
| **SECTOR 4** | `supabase-postgres-best-practices` | Reglas query-/conn-/data-: índices, pools, agregaciones. |
| **SECTOR 5** | — (revisar `vitest.config.ts`, `.github/workflows/ci.yml`, `scripts/db-local.sh` directo) | |
| **Vulns (Sector 1/5)** | `audit-dependencies` (solo su árbol de decisión de triage) | Orden de fix: bump directo > lockfile > override, con reachability primero. |
| **Cierre** | `spec-from-findings` | Convertir hallazgos P0/P1 en specs accionables. |
| **Descartada** | `code-review` (diff-based, no whole-repo), `diagnosing-bugs` (un bug a la vez) | No encajan en auditoría integral. |
| **Herramienta primaria (todos)** | `codegraph` (MCP `codegraph_explore`) | Ya indexado en este workspace: devuelve símbolos + call paths + blast radius en una llamada. Úsalo ANTES de grep/Read. |

---

## CONTEXTO DEL PROYECTO (obligatorio leer primero)

Eres un auditor senior de software. Auditas **empresarial-saas**: un ERP multi-tenant bimonetario (USD/VES, Venezuela) construido con:
- **Payload CMS 3.88.0** + `@payloadcms/plugin-multi-tenant` (aislamiento por campo `tenant` indexado), **Next.js 16.3.0** (App Router, RSC), **React 19.2.6**, **Supabase Postgres** (via `@payloadcms/db-postgres` + drizzle), **Vercel Serverless** (Transaction Pooler puerto 6543, pool max 10), **Zod v4**, **vitest**, Tailwind 4 + shadcn/ui.
- **Arquitectura obligatoria** (AGENTS.md §2.1, invariante): colecciones puras en `src/collections/<Dominio>/index.ts` · plugins in-repo con patrón currying `(options) => (config) => Config` en `src/plugins/` (componiendo hooks, NUNCA sobrescribiendo) · lógica de negocio en `src/utilities/` · superficie Next.js en `src/actions/` (Zod + `requireErpTenantAccess` + `withTransaction`) · UI en `src/app/(app)/[tenant]/erp/*` y `src/components/erp/*` · jobs en `src/jobs/`.
- **Dominios de negocio**: Facturas (CxC), Cotizaciones, Pedidos, Remisiones/Notas de entrega, POS, Clientes, Proveedores (CxP), Compras, Inventario (Kardex inmutable con advisory locks `pg_advisory_xact_lock`), Producción/BOM, Cajas y cierres de turno, Tasas cambiarias (bimonetario con snapshot), Motor de precios por tiers, Auditoría (auditPlugin), Alertas (job cada 15 min), Reportes (libro de ventas, antigüedad, kardex), Plantillas industriales, Compartición pública de documentos por token.
- **Métricas verificadas (2026-09-10, HEAD 162bc64)**: 48,259 LOC TS/TSX en `src/` · 233 archivos (107 components, 44 app, 24 utilities, 23 collections, 3 plugins, 2 jobs, 2 actions) · 22 migraciones (+ index.ts) · **44 Server Actions** (41 en `erpActions.ts` + 3 en `shareActions.ts`) · 3 plugins in-repo · 4 suites de tests (27 bloques `it/test`: 3 unitarias + 1 integración) · **11 vulnerabilidades** en `pnpm audit` · 25 casts `as unknown as` fuera de `payload-types.ts` · **NO existe `middleware.ts`** (la defensa es layout + action level).
- **Estado del core (pre-verificado, confirmar en Sector 0)**: todas las `@payloadcms/*` pinneadas EXACTAS a 3.88.0 (sin drift) · solo plugins oficiales en config (multiTenant, s3Storage, importExport, email-resend/nodemailer) · los 3 plugins in-repo siguen el patrón canónico (currying, hook composition `[miHook, ...(existentes || [])]`, context flags `skipSaleStockPosting`/`skipPriceHistory`/`skipAuditLog`/`allowInternalStockUpdate`, propagación de `req`) · único override de pnpm: `@aws-sdk/lib-storage` (benigno).
- **Reglas de oro del repo** (verificar cumplimiento): `req` SIEMPRE en operaciones Local API dentro de hooks (atomicidad transaccional) · `req.context` para prevenir loops de recursión · `overrideAccess: false` cuando se opera en nombre de un usuario · cero `any`/`@ts-ignore` sin justificación · cero código destructivo de comentarios.

### Hallazgos ya detectados (punto de partida — NO repetir su descubrimiento; verificar, reachability y expandir)
1. **[P0] `next@16.3.0` — 2 CRITICAL: RCE no autenticado** (parche >= 16.3.3). Confirmado presente. Verificar exposición real (middleware de imagen, hosts Windows) y factibilidad del bump.
2. **[P1 · NUEVO · SIN PARCHE] `payload@3.88.0` — moderate: "default account-unlock access allows authenticated users to reset other accounts' lockouts"** (vulnerable <=3.88.0, patched `<0.0.0` = no existe fix). Auditar `src/collections/Users.ts` (auth: maxAttempts/lockTime/unlock) y si el endpoint de unlock es alcanzable por usuarios no-admin. Mitigación a proponer: access custom en la operación unlock.
3. **[P1 · NUEVO] `csv-parse <7.0.2` — moderate: prototype pollution alcanzable** vía nuestro CSV de importación (`src/utilities/csv.ts` + `inventoryImport.ts` + plugin import-export). Superficie: upload por tenant-admin. Verificar sanitización y versión efectiva.
4. **[P2] `sharp@0.34.2` — 2 high** (libvips/libheif, parche >= 0.35.4) · `esbuild` dev-only · `dompurify` vía `@payloadcms/ui`/monaco (superficie admin-only).
5. **[P2 · NUEVO] `importExportPlugin.overrideImportCollection/overrideExportCollection` REEMPLAZAN el objeto `access` de products/customers/categories/suppliers completo** (`payload.config.ts:276-301`) — no lo componen. Verificar si pisó access functions pre-existentes y el efecto en el admin panel regular (¿products.update quedó super-admin-only en TODO el panel?).
6. **[P2 · NUEVO] Sin `middleware.ts`**: cada ruta depende del check en `erp/layout.tsx` + `requireErpTenantAccess` por acción. Verificar fail-closed en TODAS las rutas (incl. exports `reports/*/export/route.ts`, `inventory/import/template/route.ts`).
7. **[DÉFICIT] Cobertura de tests mínima**: 27 tests para ~48k LOC. Dominios sin suite: POS, compras, pagos, cajas, reportes, auditoría, compartición, multi-tenant, pricing, alerts, jobs.
8. **[OLIGOPOLIO] `src/actions/erpActions.ts` = 3,524 líneas / 41 acciones** y `src/utilities/erpData.ts` = 2,137 — archivos dios.
9. **[RENDIMIENTO] `findAllDocs`/`findAllMatching`** (`erpData.ts:152`, `dashboardData.ts:76`) paginan TODOS los documentos (limit 500/página) para computar métricas en JS en vez de SQL/agregaciones.
10. **[RUIDO] `INVOICE_SHARE_BLOCKED` sin uso** (`shareActions.ts:60`) · 25 casts `as unknown as` con hotspots: `withTransaction:89` (req fake), `erpAuth:63`+`erpData:109`+3 colecciones (cast de `user.tenants`), `financeLedger:41`/`purchasesLedger:60`/`inventoryLedger:32` (cast del db adapter).
11. **[DISEÑO — verificar si es fortaleza] `requireErpTenantAccess` re-hidrata el usuario desde BD en cada request** (`erpAuth.ts:30`) en vez de confiar en claims del JWT — más fuerte contra JWTs stale. Confirmar que `role` también se revalida y que ningún path confía solo en el JWT.
12. **[CI] `ci.yml` corre typecheck + lint + migrate + tests — pero SIN `pnpm audit` gate y SIN build.** Evaluar ambos como gaps.

---

## INSTRUCCIONES GENERALES PARA TODOS LOS SECTORES

1. **Herramienta primaria**: `codegraph_explore` — una llamada devuelve símbolos + rutas de llamada + blast radius. No leas archivos completos a mano si codegraph puede responder.
2. **Reglas de hallazgo** (invariables):
   - Cada hallazgo: **severidad** (P0 bloqueante producción / P1 grave / P2 mejora / P3 cosmético) + **evidencia exacta** (`ruta/archivo:línea`) + **una frase de impacto de negocio**.
   - Máximo 15 hallazgos por sector. Prioriza, no inundes.
   - P0/P1 se marcan `VERIFICADO` (segunda pasada con contexto limpio) o `SIN VERIFICAR`.
   - Sé ambicioso: busca "code judo" — reestructuraciones que simplifiquen drásticamente, no solo nits.
3. **Caza de edge cases sistemática**: para cada operación crítica, enumera explícitamente los escenarios límite y di qué pasa HOY (con evidencia). Base de edge cases: la skill `payload` (3 Security Pitfalls + 11 Gotchas + ACCESS-CONTROL-ADVANCED §"Test Edge Cases": no user / wrong user / admin) + la matriz específica del sistema en cada sector.
4. **Cero espera**: no esperes builds ni bots. Entregas parciales si un paso excede el tiempo.
5. Al final de cada sector escribe `AUDIT-<YYYYMMDD>/SECTOR-<N>.md`.

---

# SECTOR 0 — CUMPLIMIENTO PAYLOAD & INTEGRIDAD DEL CORE

**Objetivo**: responder cuantitativamente "¿qué tanto seguimos las buenas prácticas de Payload?", "¿el core sigue intacto?" y "¿nuestros plugins sobre Payload no rompieron nada?".

Herramientas: skill `payload` completa (SKILL.md + reference/PLUGIN-DEVELOPMENT.md + ADAPTERS.md + HOOKS.md), codegraph (`impact` sobre los 3 plugins).

1. **Integridad del core** (binario: ✓/✗ por ítem):
   - Cero código vendido/monky-patched de Payload en `src/` (grep `payloadcms` en src — solo imports oficiales).
   - Las 10 dependencias `@payloadcms/*` pinneadas exactas a 3.88.0 (package.json — pre-verificado, confirmar sin drift).
   - Ningún plugin muta `incomingConfig` destructivamente: los 3 in-repo hacen `map` + `spread` + `append` (pre-verificado en `salesInventory.ts:126-213`, `pricing.ts:224-243`, `audit.ts:265-290` — confirmar de nuevo).
   - Config usa SOLO adaptadores/plugins oficiales (`multiTenantPlugin`, `s3Storage`, `importExportPlugin`, `resend/nodemailerAdapter`, `postgresAdapter` con `push: false` y migraciones explícitas).
2. **Checklist de cumplimiento plugin a plugin** (por cada uno de salesInventory, pricing, audit — tabla plugin × regla):
   - Doble flecha `(options) => (config) => Config` con opción `enabled`.
   - Hook COMPOSITION: `afterChange: [miHook, ...(existentes || [])]` — nunca reemplazo.
   - Inyección de campos por `map` + `spread` (incl. el caso fino: salesInventory inyecta `product` DENTRO de los fields del array `items` de invoices — verificar que no pisó nada).
   - `req.context` flags para prevenir loops (`skipSaleStockPosting`, `skipPriceHistory`, `skipAuditLog`, `allowInternalStockUpdate`) y propagación de `req` en TODA operación anidada.
   - Collections registradas por el plugin (price-history, audit-log) con access denegando escritura directa — solo hooks.
3. **Los 3 Security Pitfalls + 11 Common Gotchas de la skill, item por item contra el código**:
   - Local API bypasses access (¿dónde pasamos `user` sin `overrideAccess: false`? — mapa completo de los ~75 usos de `overrideAccess`).
   - Missing `req` en operaciones anidadas (barrido de todos los hooks: plugin + colecciones + jobs).
   - Hook loops (¿alguna operación anidada que re-dispare su propio hook SIN context flag?).
   - Gotchas: depth default 2 (¿queries RSC con depth innecesario?), field-level access boolean-only, `useAsTitle` nunca virtual, `_status` auto-inyectado (¿colisiona con nuestros campos `status` propios? — documentado como desviación ERP deliberada, evaluar).
4. **Desviaciones deliberadas** (juzgar con lente ERP, no lente CMS — documentar cada una como consciente o deuda):
   - `versions: { drafts: true }` NO usado en documentos ERP (usan `status` propio draft/voided) — la skill lo recomienda para colecciones de contenido; ¿es correcta la desviación aquí?
   - `audit-log` fuera del multiTenantPlugin (razón documentada en `payload.config.ts:225-231`: operaciones globales) — verificar que el aislamiento manual del access read sea suficiente.
   - Slug fields nativos no usados (ERP no tiene contenido editorial — evaluar).
5. **Score de cumplimiento Payload por capa** (%): plugins in-repo / colecciones / actions+queries / config / jobs.

**Entregable SECTOR-0.md**: tabla plugin × regla canónica (✓/✗), checklist pitfall/gotcha × evidencia, lista de desviaciones conscientes vs deuda, score % por capa.

---

# SECTOR 1 — SEGURIDAD Y MULTI-TENANCIA (crítico primero)

**Objetivo**: verificar que ningún inquilino puede ver/tocar datos de otro, y que la superficie pública es segura.

Usa las skills `security-and-hardening` (threat model STRIDE) y `code-security` (reglas OWASP TS/JS).

1. **Aislamiento tenant (P0 si falla)**:
   - `src/utilities/erpAuth.ts` (`requireErpTenantAccess`, `getErpUser`): re-hidratación desde BD por request (hallazgo #11 — confirmar fortaleza: ¿`role` revalidado? ¿ningún path confía solo en JWT?).
   - Toda la superficie: 44 acciones (`erpActions.ts`, `shareActions.ts`), `erpData.ts` (16+ funciones `getXList`): ¿cada read/write filtra por `tenant`? Busca queries sin `where: { tenant ... }` o con `overrideAccess: true` injustificado (mapa de los ~75 usos).
   - `audit.ts`: lectura tenant-scoped con `tenant: { in: tenantIds }` — ¿filtración de eventos globales (tenant null) al non-super-admin?
2. **Exposición del CVE sin parche (hallazgo #2)**: `Users.ts` auth config (maxAttempts, lockTime) + ¿quién puede llamar unlock? Proponer mitigación de access custom YA que no existe fix upstream.
3. **Superficie pública de compartición** (`/share/*`): tokens de 24 bytes CSPRND (base64url) — ¿enumerables? ¿Timing-safe comparison? ¿Fuga de datos del tenant en la página pública? (`shareActions.ts` + `app/(share)/` + `documentSharing.ts`).
4. **Sin middleware (hallazgo #6)**: verificar fail-closed de `erp/layout.tsx` y de TODOS los route handlers — incl. `api/exchange-rates`, `api/pricing/report`, `reports/*/export/route.ts`, `inventory/import/template/route.ts`.
5. **Seguridad de Payload**: access functions de las 23 colecciones — ¿alguna devuelve `true` sin querer? ¿`saveToJWT` de roles?
6. **Secretos y config**: `.env.example` (29 vars) vs código — ¿hardcoded secrets? `SUPABASE_ROOT_CA` en `src/constants/supabaseCa.ts` (¿correcto exponerlo al bundle?). `PAYLOAD_SECRET` obligatorio (verificado en config:50-55).
7. **Dependencias (hallazgos #1-#4)**: expandir el triage de las 11 vulns con reachability y el árbol de decisión de `audit-dependencies`. csv-parse: trazar la ruta exacta upload→parse→modelo.
8. **OWASP rápido**: inyección SQL (las queries crudas de `inventoryLedger.ts`/`salesLedger.ts` usan `sql` template — verificar que TODO input pasa parametrizado, incl. `sql.raw(column)` de `nextDocumentNumber:569`), XSS (HTML de emails en `buildDocumentEmailHtml`), CSRF, headers de seguridad en `next.config.ts`.

**Entregable SECTOR-1.md**: tabla priorizada P0–P3 con evidencia y remedio, modelo de amenazas resumido (boundaries → STRIDE → mitigación), verificación de hallazgos 1-6.

---

# SECTOR 2 — INTEGRIDAD DE DATOS, TRANSACCIONES, LEDGERS + EDGE CASES (el corazón del ERP)

**Objetivo**: el dinero y el stock nunca pueden quedar en estado inconsistente. Este sector responde "¿qué tan robusto? ¿qué se puede romper?".

Herramientas: codegraph (`impact` sobre `applySaleStockDeduction`, `revertSaleFromInventory`, `nextDocumentNumber`, `postSaleStockHook`), skill `payload` (§transacciones), skill `supabase-postgres-best-practices` (locks).

1. **Atomicidad transaccional**: `withTransaction` (`erpActions.ts:83-103`) — ¿qué acciones escriben múltiples docs SIN transacción? (candidatos ya vistos: `updateQuoteAction`, `updateTenantSettingsAction`, `createSupplierAction` — revisar TODO el archivo). Ojo: el `req` fake de withTransaction lleva `user` pero las operaciones anidadas corren con `overrideAccess: true` implícito — verificar que TODA acción pre-autoriza con `requireErpTenantAccess` antes.
2. **Kardex inmutable** (`inventoryLedger.ts`): advisory locks en `lockStockBalances` (ordena por productId — ¿y warehouseId? ¿deadlock A-B/B-A entre venta y consumo de producción?) · `recalculateProductTotalStock` con `FOR UPDATE` + `runIsolatedContext` — ¿puede quedarse a medias?
3. **Idempotencia y numeración**: `nextDocumentNumber` (`erpActions.ts:552-577`) con `pg_advisory_xact_lock(hashtext(...))` — seguro SOLO dentro de transacción: ¿los 9 callers están todos en `withTransaction`? El regex `~ ('^' || prefix || '-[0-9]+$')` filtra números manuales de la secuencia — ¿qué pasa si un usuario introduce MANUALMENTE "FAC-00042"? ¿Los unique constraints (`document_number_uniques`, `cxp_number_uniques`) cubren TODAS las 9 colecciones de DOC_NUMBER_TABLES?
4. **Ciclo venta→inventario** (`salesInventory.ts:47-67`): estados `voided`↔reactivación — edge case del ciclo completo: crear→anular→reactivar→anular otra vez, ¿duplica reversos? `revertSaleFromInventory` (`salesLedger.ts:203`) agrupa por producto+almacén y descuenta devoluciones previas — verificar carrera entre devolución parcial manual y anulación total concurrente.
5. **Costo ponderado**: `updateProductWeightedCostOnPurchase` (`inventoryLedger.ts:517`) — los reversos de anulación entran con `unitCostUSD: 0` (`salesLedger.ts:277`): ¿cómo afecta eso el costo promedio ponderado del producto? ¿Snapshot de tasa conservado en devoluciones de compra?
6. **Cartera y balances**: reconciliación de cuotas al anular (`voidInvoiceAction` — "marca todas pendientes como cubiertas": ¿correcto contablemente?); balances `balanceUSD/balanceVES` vs pagos — ¿invariantes? `purchasesLedger.ts` (617 líneas): mismo análisis CxP. `cashLedger.ts`: cierre de turno concurrente con pagos en vuelo.
7. **MATRIZ DE EDGE CASES del sistema** (enumerar qué pasa HOY con evidencia, por columna):
   | Operación | Escenario límite | ¿Qué pasa hoy? |
   |---|---|---|
   | POS / createInvoice | doble submit (doble click, red lenta) | ¿idempotency key? |
   | POS checkout | tasa cambia entre snapshot y commit | ¿rate congelado por doc? |
   | Factura | void→reactivar→void | ¿doble reverso de stock? |
   | Devolución | anulación total concurrente con devolución parcial | locks ¿lo cubren? |
   | Numeración | número manual que matchea el formato del sistema | ¿salta la secuencia? ¿colisión? |
   | Producción | consumo de BOM concurrente con venta del mismo producto | ¿orden de locks global? |
   | Caja | pago durante el cierre de turno | ¿queda fuera del cierre? |
   | Import CSV | fila con valores prototype-pollution (`__proto__`) | csv-parse <7.0.2 |
   | Compartición | token expired/revocado, kind inválido | ¿fail-closed? |
   | Rate externo | fetch falla / timeout / tasa absurda (1 o 10^9) | ¿sanity bounds? |
8. **Migraciones** (22 archivos): ¿reversibles? ¿Índice en cada FK (`tenant`, líneas de documento: product/invoice/customer)? ¿Drift schema real vs `payload-types.ts`?

**Entregable SECTOR-2.md**: matriz de invariantes de negocio (stock >= 0, balance = total − pagos, número único, kardex inmutable) × garantía (BD / código / NADA) — esa tabla ES el diagnóstico de producción — + matriz de edge cases completa.

---

# SECTOR 3 — ARQUITECTURA, CALIDAD Y "CÓMO SE HABLAN LAS COSAS"

Herramientas: skill `thermo-nuclear-code-quality-review` + `codebase-design` + codegraph (call paths). Sé brutal y ambicioso (code judo).

1. **Cumplimiento de la constitución** (AGENTS.md §2.1, tabla de 6 capas): recorrer cada capa y localizar violaciones con codegraph: ¿lógica de negocio en collections? ¿plugins con cableado de UI? ¿actions con lógica que debería ser utility? ¿hooks de colección que acoplan dominios? ¿utilities importando UI o config?
2. **"Cómo se hablan las cosas" (grafo real de comunicación)**: con codegraph, trazar 5 flujos críticos de punta a punta (POS checkout, emisión de factura, anulación, importación de stock, auto-email de factura) y dibujar el grafo capa→capa. Verificar la DIRECCIÓN de cada dependencia contra §2.1 (collections ↛ plugins/utilities ajenos; utilities ↛ UI; actions → utilities only). Calcular fan-in/fan-out de `erpData.ts`, `erpActions.ts`, `inventoryLedger.ts`.
3. **Archivos dios**: `erpActions.ts` (3,524 líneas / 41 acciones), `erpData.ts` (2,137), `erpValidation.ts` (678), `POSView.tsx` (643), `PurchaseInvoices/index.ts` (633). Proponer el plan de descomposición canónico (por dominio: sales, purchases, cash, catalog, admin), con orden y riesgo.
4. **Duplicación estructural**: `findAllDocs` (erpData) vs `findAllMatching` (dashboardData) — misma paginación copiada; `extractId`/`getUserTenantIds` definidos en múltiples archivos — consolidar; patrón modal duplicado (14 modales en `components/erp/modals/`) — ¿cuántos comparten esqueleto? Extraer `ModalForm` genérico.
5. **TypeScript estricto**: los 25 casts `as unknown as` (hallazgo #10): ¿cuáles son tratables con tipos del `payload-types.ts` (p. ej. `user.tenants` ya está tipado — ¿por qué el cast?) y cuáles estructurales (db adapter)?
6. **Código muerto**: `INVOICE_SHARE_BLOCKED`; exports sin callers (codegraph `callers` en 0); constantes huérfanas; modales sin ruta.
7. **Navegación UI**: 21 rutas ERP — consistencia de layouts, loading states, error boundaries por dominio.
8. **Docs vs código**: ROADMAP.md (Fase 12-13, sprints 40-45) — ¿drift entre lo prometido y lo implementado? AGENTS.md §5.1/§5.2 — ¿se respeta?

**Entregable SECTOR-3.md**: top 10 oportunidades de simplificación dramática (con líneas eliminables estimadas), grafo de comunicación capa→capa con violaciones marcadas, mapa de deuda, veredicto de adherencia a la constitución por capa (%).

---

# SECTOR 4 — RENDIMIENTO Y ESCALA (Serverless + Postgres)

Herramientas: skill `supabase-postgres-best-practices` (reglas query-, conn-, data-), codegraph `impact`.

1. **Killer #1 — `findAllDocs`/`findAllMatching`** (`erpData.ts:152`, `dashboardData.ts:76`): cargar TODAS las facturas/productos del tenant en memoria para computar KPIs en JS. Con 10k facturas: ¿cuántas round-trips? Proponer: agregaciones SQL (`SUM/GROUP BY` vía drizzle `db.execute` — patrón ya existente en `inventoryLedger.ts`), o `payload.db.select`. Estimar el umbral de quiebre (docs/tenant).
2. **Índices**: cada query de `erpData.ts` — ¿usa índices? ¿`tenant` index en TODAS las tablas (invariante AGENTS.md §3)? ¿FK indexes en líneas de documento? Verificar contra las 22 migraciones.
3. **N+1 y depth**: `getBillOfMaterialsList` con `depth: 2`, `getInvoicesList` con `depth: 1` — ¿cuántos JOINs dispara drizzle? RSC dashboard serializa todo — peso del HTML.
4. **Pool**: Transaction Pooler 6543 max 10 — con `getDashboardMetrics` paginando 6-7 colecciones en paralelo (`Promise.all`) — ¿agotamiento en serverless? ¿3 tenants concurrentes?
5. **Caching/revalidation**: 83 llamadas a `revalidatePath` — ¿over-invalidation? ¿Tags? ¿`getLiveExchangeRates` cachea el fetch externo?
6. **Serverless cold starts**: `getPayload({ config })` por request — el peso del config (plugins, migraciones import) — ¿aligerable?
7. **Frontend**: POS (643 líneas) — ¿debounce en búsquedas? recharts client components pesados — ¿SSR bloqueante? `useSyncOnKeyChange` — ¿re-renders evitables?

**Entregable SECTOR-4.md**: tabla consulta → problema → remedio → ahorro estimado, umbral de quiebre por dominio, lista de índices faltantes con DDL propuesto.

---

# SECTOR 5 — TESTS, CI/CD Y READINESS PARA PRODUCCIÓN

1. **Inventario de cobertura**: 27 tests (3 suites unit + 1 integración). Mapear dominio × suite: ¿qué queda en cero? (POS, compras, pagos, cajas, reportes, share, multi-tenant, pricing, alerts, jobs). ¿Los tests prueban comportamiento o implementación? ¿Edge cases de concurrencia de la matriz del Sector 2 tienen test?
2. **Pipeline CI** (`ci.yml`): typecheck + lint + migrate + test. Gaps (hallazgo #12): SIN `pnpm audit` gate, SIN build. ¿Despliegue automatizado?
3. **Protocolo de BD local**: `scripts/db-local.sh` — ¿robusto? ¿Los tests documentan su prerequisito?
4. **Producción checklist** (veredicto con evidencia): migraciones aplicadas y consistentes en Supabase (`migrate:status`), secretos en Vercel, `PUBLIC_BASE_URL` seteado (shareActions lo exige), email (Resend) en prod, backups Supabase, monitoreo/errores (Sentry?), rate limiting, Términos del Transaction Pooler.
5. **Estado del ROADMAP**: Fase 13 — ¿qué "Pendiente Fase 10" quedó abierto? Gap listado como riesgo de lanzamiento.
6. **Veredicto final**: % readiness con (a) blockers P0 (Sectores 0-2 deben estar), (b) qué hacer antes del lanzamiento (esfuerzo S/M/L), (c) qué espera al post-launch.

**Entregable SECTOR-5.md**: matriz de cobertura de tests, pipeline actual vs requerido, checklist de producción ✓/✗/N-A, roadmap a producción (semanas por ítem).

---

## ORDEN DE EJECUCIÓN RECOMENDADO

0 → 1 → 2 → 3 → 4 → 5 (cumplimiento Payload calibra el resto; seguridad e integridad siguen primero; 5 consume los hallazgos de todos).
Si vas por partes: cada sector es auto-contenido y arranca re-leyendo CONTEXTO DEL PROYECTO + su skill correspondiente del MAPA DE SKILLS.

## FORMATO DEL INFORME FINAL (AUDIT-<fecha>/REPORT.md)

1. **Resumen ejecutivo** (10 líneas): estado general, top 5 riesgos, estimación de remediación.
2. **Scorecard** (0-10 con justificación breve): **Cumplimiento Payload** · Seguridad · Integridad de datos · Robustez (edge cases) · Arquitectura/acoplamiento · Calidad de código · Rendimiento · Tests · Readiness producción · **Score global del sistema**.
3. **Tabla consolidada** de TODOS los hallazgos (severidad × riesgo negocio × esfuerzo S/M/L).
4. **Detalle por sector** (referencia a SECTOR-*.md).
5. **Métricas base** para comparar en la próxima auditoría (LOC, tests, vulns, casts, deuda).
6. **Recomendación**: qué hallazgos se convierten en specs YA (skill `spec-from-findings`).
