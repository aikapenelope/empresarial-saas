# SECTOR 0 — CUMPLIMIENTO PAYLOAD & INTEGRIDAD DEL CORE
**Auditoría:** 2026-09-10 · HEAD `162bc64` · Payload 3.88.0 · Next 16.3.0
**Modo:** lectura (sin modificaciones a código de producto)

---

## RESUMEN EJECUTIVO DEL SECTOR

El core de Payload está **intacto y sin hacks**. Los 3 plugins in-repo siguen el patrón canónico con composición de hooks correcta. El cumplimiento de las buenas prácticas de Payload es alto en la capa de plugins y config (9.5/10) y sólido en colecciones (8/10). El mayor riesgo del sector es el **CVE de account-unlock sin parche** que aplica directamente: `Users.ts` no define `access.unlock` custom ni `auth.maxAttempts`.

---

## 1. INTEGRIDAD DEL CORE (checklist binario)

| Ítem | Estado | Evidencia |
|---|---|---|
| Cero monkey-patching de Payload | ✓ | grep `prototype\|__proto__\|Object.assign(payload` en `src/` → 0 hits. 77 archivos importan solo APIs oficiales. |
| Dependencias `@payloadcms/*` pinneadas exactas a 3.88.0 | ✓ | `package.json:29-40` — las 10 dependencias `@payloadcms/*` en `3.88.0` exacto (db-postgres, email-nodemailer, email-resend, next, plugin-import-export, plugin-multi-tenant, richtext-lexical, storage-s3, translations, ui) + `payload: 3.88.0`. |
| Ningún plugin muta `incomingConfig` destructivamente | ✓ VERIFICADO | `salesInventory.ts:126-213`, `pricing.ts:224-243`, `audit.ts:265-290` — los 3 hacen `map` + `spread` + `append`, nunca reemplazan arrays enteros. |
| Config usa SOLO adaptadores/plugins oficiales | ✓ | `payload.config.ts:183-302` — `multiTenantPlugin`, `s3Storage`, `importExportPlugin`, `resendAdapter/nodemailerAdapter`, `postgresAdapter` con `push: false` + migraciones explícitas (`payload.config.ts:156-158`). |
| Único override pnpm: `@aws-sdk/lib-storage: 3.1126.0` | ✓ benigno | `package.json` pnpm.overrides — pin de seguridad del SDK de S3, no afecta Payload. |

**Veredicto: el core de Payload sigue intacto. Nada de lo que se construyó encima rompió el framework.**

---

## 2. CHECKLIST PLUGIN × REGLA CANÓNICA (skill payload §PLUGIN-DEVELOPMENT + AGENTS.md §2.1)

| Regla canónica | salesInventory | pricing | audit |
|---|---|---|---|
| Doble flecha `(options) => (config) => Config` | ✓ `salesInventory.ts:116-118` | ✓ `pricing.ts:116-118` | ✓ `audit.ts:84-86` |
| Opción `enabled` por instalación | ✓ `:119-121` | ✓ `:119-121` | ✓ `:87-89` |
| Hook COMPOSITION `[miHook, ...(existentes \|\| [])]` | ✓ `afterChange:169`, `beforeDelete:171-173` | ✓ `beforeValidate:232`, `beforeChange:233` | ✓ `afterChange:272-275`, `afterDelete:276-279` |
| Inyección de campos por map+spread (no reemplazo) | ✓ `:154-162` (inyecta `product` dentro de `items` sin pisar) | ✓ `:224-239` | ✓ (no inyecta campos, registra colección) |
| `req.context` flags anti-loop | ✓ `skipSaleStockPosting:53` | ✓ `skipPriceHistory:67` | ✓ `skipAuditLog:208,241` |
| `req` SIEMPRE en operaciones anidadas | ✓ (43/43 calls verificados con perl multi-línea) | ✓ | ✓ |
| Colecciones del plugin con escritura denegada (solo hooks) | n/a | ✓ `price-history` `create/update/delete: () => false` (`pricing.ts:139-141`) | ✓ `audit-log` idem (`audit.ts:122-124`) |
| Access read tenant-scoped en colección del plugin | n/a | ✓ `read: Boolean(user)` (`pricing.ts:138`) — ver P2-S0-01 | ✓ `tenant: { in: tenantIds }` + eventos globales solo super-admin (`audit.ts:109-121`) |

**Los plugins sobre Payload NO se rompieron y NO rompieron Payload. Puntaje: 3/3 plugins canónicos.**

---

## 3. LOS 3 SECURITY PITFALLS DE LA SKILL, ITEM POR ITEM

### Pitfall #1 — Local API bypasses access control
**Estado del repo: protegido por diseño con una salvedad documentada.**
- `getErpUser` (`erpAuth.ts:30-34`) re-hidrata el usuario desde BD en cada request (findByID con depth 0) en vez de confiar solo en el JWT — más fuerte contra JWTs stale.
- Las 44 Server Actions pre-autorizan con `requireErpTenantAccess` (41 callers de `ErpAccessError` verificados por codegraph) ANTES de cualquier escritura con `overrideAccess` implícito.
- `withTransaction` (`erpActions.ts:83-103`) construye un `req` fake con `user` pero las operaciones anidadas corren con overrideAccess implícito true — **diseño consciente**: la autorización ocurrió en la frontera de la action, no dentro de la transacción. Es el patrón "authorize at the edge, trust inside" — válido, pero depende 100% de que TODA action llame `requireErpTenantAccess` primero. **P2-S0-01: sin test automatizado que garantice que ninguna action futura omita el guard.**
- `getErpUser` usa `overrideAccess` por defecto (true) para rehidratar — correcto (es lectura de autenticación).
- Hallazgo a expandir en Sector 1: `importExportPlugin.overrideImportCollection` (`payload.config.ts:276-301`) **REEMPLAZA** el access completo de 4 colecciones (products/customers/categories/suppliers) en vez de componerlo — confirmado en Sector 0 como violación del patrón de preservación.

### Pitfall #2 — Missing `req` breaks transaction atomicity
**Estado: EXCELENTE.**
- Verificación automatizada (perl multi-línea sobre los 43 calls `req.payload.*` en `src/collections`, `src/plugins`, `src/jobs`): **43/43 pasan `req`** — cero excepciones.
- Los jobs rehidratan usuario y operan con `req` del job (`seedIndustryTemplate.ts:25` usa `overrideAccess: false` + RBAC real contra el usuario que autorizó; `evaluateAlerts.ts` usa overrideAccess documentado para cron sin usuario).
- Única excepción consciente: `updateTenantSettingsAction` (`erpActions.ts:3440`) usa `payload.update` SIN `req` y SIN transacción — pero es update de un solo doc de tenants (no multi-doc). Ver Sector 2 §1.

### Pitfall #3 — Infinite hook loops
**Estado: EXCELENTE.**
- Los 4 context flags verificados: `skipSaleStockPosting` (`salesInventory.ts:53`), `skipPriceHistory` (`pricing.ts:67`), `skipAuditLog` (`audit.ts:208,241`), `allowInternalStockUpdate` (`salesLedger.ts:287`), `skipRecalculation` (patrón AGENTS.md, presente en inventoryLedger).
- `runIsolatedContext` (`requestContext.ts:21`) existe como utilidad de aislamiento de contexto para hooks anidados — buen diseño.
- Blast radius por codegraph: `postSaleStockHook` → `salesInventory.test.ts` (la única suite de integración cubre justo el ciclo más peligroso).

---

## 4. LOS 11 COMMON GOTCHAS DE LA SKILL, ITEM POR ITEM

| # | Gotcha | Estado | Evidencia |
|---|---|---|---|
| 1 | Local API bypasses access | Protegido (ver Pitfall #1) | `erpAuth.ts:47-72` + 41 callers |
| 2 | Missing req en anidadas | 43/43 ✓ | Verificación perl §3 |
| 3 | Hook loops | 4 context flags + `runIsolatedContext` | `salesInventory.ts:53`, `pricing.ts:67`, `audit.ts:208` |
| 4 | Field-level access = boolean only | Cumplido donde se usa | `Users.ts:69-75` (role create/update super-admin only) |
| 5 | Depth default 2 | **P2-S0-02** | `getBillOfMaterialsList` depth:2, `getInvoicesList` depth:1 — sin `maxDepth` config ni `select`. Queries RSC sin `select` (detalle en Sector 4). |
|  ALL | depth awareness | OK | Todos los `findByID` de hooks usan `depth: 0` explícito (`pricing.ts:84`, `salesLedger.ts:241`, `BillOfMaterials:13`) — excelente disciplina |
| 6 | `_status` auto-inyectado colisiona con status propios | N/A (desviación consciente) | ERP usa `status` propio draft/voided/issued sin `versions.drafts`. No hay colisión de nombre porque drafts NO está habilitado. La desviación es correcta para documentos transaccionales (ver §5). |
| 7 | Types regenerate en dev/build | ✓ | `typescript.outputFile` en config; `payload-types.ts` 2,407 líneas en sync. CI corre typecheck. |
| 8 | MongoDB replica set | N/A | Postgres. |
| 9 | SQLite transactions disabled | N/A | Postgres. |
| 10 | Point fields no SQLite | N/A | Postgres. |
| 11 | `useAsTitle` nunca virtual | ✓ | Todas las colecciones usan campos stored (`useAsTitle: 'name'/'email'/'id'`). 0 virtuales como título. |

---

## 5. DESVIACIONES CONSCIENTES vs DEUDA

| Desviación | Veredicto | Justificación |
|---|---|---|
| Sin `versions: { drafts: true }` en documentos ERP | **CONSCIENTE — CORRECTA** | La skill lo recomienda para colecciones de CONTENIDO editorial. Los documentos transaccionales de ERP (facturas, pedidos) NO son contenido: son records inmutables con máquina de estados propia (`draft→issued→voided` con inmutabilidad forzada en hooks — `Orders/index.ts:86-142`, `Quotes/index.ts:50-58`). Habilitar drafts inyectaría `_status` + version rows con coste de escritura sin beneficio y semántica equivocada (un draft ERP NO es un draft editorial). |
| `audit-log` fuera del multiTenantPlugin | **CONSCIENTE — CON RIESGO DOCUMENTADO** | Razón documentada en `payload.config.ts:225-231`: operaciones globales (tenant null). El aislamiento lo aplica el access read del propio auditPlugin (`audit.ts:109-121`: `tenant: { in: tenantIds }`). Riesgo residual: el aislamiento es manual — cualquier query RSC contra audit-log que olvide el `where tenant` filtra por el access, pero el access se basa en `getUserTenantIds(user)` del JWT rehidratado — dependencia de rehidratación correcta (verificada). |
| Sin slug fields nativos | **CONSCIENTE — SIN COSTE** | ERP sin contenido editorial. Los "slugs" son tenant slugs gestionados en Tenants.ts. |
| `importExportPlugin` REEMPLAZA access en vez de componer | **DEUDA — P2-S0-03** | `payload.config.ts:276-301` pisa el access de products/customers/categories/suppliers. Antes del override, products.update era `super-admin/tenant-admin/supervisor` (rol operator); después queda super-admin ONLY. Efecto: tenant-admin NO puede editar un producto desde el admin panel (solo desde el ERP via actions). Verificar si es intención (probablemente sí: el ERP es la superficie operativa) pero es una violación del patrón de composición que merece comentario/documentación o fix con composición. |
| `status` propio en docs ERP vs `_status` editorial | CONSCIENTE (ver arriba) | Máquina de estados transaccional con inmutabilidad forzada. |

---

## 6. SCORE DE CUMPLIMIENTO POR CAPA

| Capa | Score | Justificación |
|---|---|---|
| **Plugins in-repo** | **9.5/10** | Patrón canónico 3/3, context flags, req threading 43/43. Único gap: `price-history` read `Boolean(user)` no es tenant-scoped per se (el multiTenantPlugin lo blinda — `payload.config.ts:224`) → sin riesgo real. |
| **Colecciones** | **8/10** | Access functions bien definidas por rol (ej. `Users.ts:16-43`, `BillOfMaterials:118-134`), tenant stamping en beforeValidate (16 colecciones), máquinas de estado correctas. Deuda: `Users.ts` no define `auth.maxAttempts`/`access.unlock` (CVE) — detalle en Sector 1; casts `as unknown as` en 3 colecciones (`user.tenants`) tipables. |
| **Actions + queries** | **7.5/10** | Patrón Zod + auth + transacción muy consistente (44/44 actions con requireErpTenantAccess). Deuda: casts estructurales (`withTransaction:89`), sin test del guard, `updateTenantSettingsAction` sin transacción. |
| **Config** | **9/10** | Solo oficial, pinneado, `push: false`, SSL estricto con CA, pool racionalizado 10/2 por contexto, secret obligatorio con throw. Gap: importExport override de access (P2-S0-03). |
| **Jobs** | **8.5/10** | `seedIndustryTemplate` rehidrata usuario con `overrideAccess: false` (RBAC real) — patrón excelente. `evaluateAlerts` usa overrideAccess true documentado (cron sin usuario) — aceptable para lecturas de evaluación + escritura de alerts (que están multi-tenant blindadas por el plugin). |

**SCORE GLOBAL SECTOR 0 (cumplimiento Payload): 8.5/10** — el proyecto usa Payload como debe ser usado: nativo, compuesto, sin hacks. El débito está concentrado en la superficie de config (importExport) y la ausencia de blindaje del unlock.

---

## HALLAZGOS DEL SECTOR 0 (para el plan de sprints)

| ID | Severidad | Hallazgo | Evidencia | Impacto negocio | Esfuerzo |
|---|---|---|---|---|---|
| **P1-S0-01** | **P1** | `Users.ts` NO define `auth.maxLoginAttempts`/`lockTime` ni `access.unlock` — el CVE GHSA de Payload 3.88.0 ("default account-unlock access allows authenticated users to reset other accounts' lockouts") aplica DIRECTAMENTE: cualquier usuario autenticado puede desbloquear cuentas ajenas vía REST `POST /api/users/unlock`. NOTA: la propiedad oficial de Payload es `maxLoginAttempts` (docs authentication/overview.mdx); las columnas `login_attempts`/`lock_until` YA existen en BD (init_core.ts:46-47) — el fix es config pura, sin migración | `src/collections/Users.ts:4-78` + `pnpm audit` + docs oficiales | Ataque de desbloqueo de cuentas = brute-force facilitado sobre cualquier usuario (incl. super-admin) | **S** — `auth: { maxLoginAttempts: 5, lockTime: 30*60*1000 }` + `access.unlock: super-admin only` (el desbloqueo operativo vía Local API `payload.unlock({ overrideAccess: true })` queda para un server action auditado) |
| P2-S0-01 | P2 | Sin test automatizado que garantice que toda Server Action actual/futura llame `requireErpTenantAccess` antes de escribir | `erpActions.ts` (44 actions, 0 tests del guard) | Una action futura sin guard = fuga multi-tenant directa | S — test de contrato (AST/lint rule) que falle si un `export async function *Action` falta el guard |
| P2-S0-02 | P2 | Queries RSC sin `select` ni `maxDepth` — depth disciplinado en hooks (depth:0) pero no en listados UI | `erpData.ts:152+` (findAllDocs sin select), `getBillOfMaterialsList` depth:2 | Over-fetching en cada render de lista → latencia y memoria (detalle Sector 4) | M |
| P2-S0-03 | P2 | `importExportPlugin` override REEMPLAZA access de 4 colecciones en vez de componerlo; products.update quedó super-admin-only (era operator) | `payload.config.ts:276-301` | tenant-admin no puede editar productos en admin panel (solo vía ERP) — probablemente intención, pero no documentado como decisión | S — componer access: `{ ...collection.access, read: … }` o documentar la decisión con comentario |
| P3-S0-01 | P3 | `price-history` read access `Boolean(user)` no es tenant-scoped explícito — confía en multiTenantPlugin | `pricing.ts:138` + `payload.config.ts:224` | Sin riesgo hoy (plugin blinda), fragilidad si se remueve del plugin | S |

**Desviaciones conscientes sin acción** (documentadas, correctas): drafts/versioning no usados en docs ERP (semántica transaccional, no editorial); audit-log fuera del multiTenantPlugin (razón documentada en config, aislamiento manual verificado); `updateTenantSettingsAction` single-doc sin transacción (no multi-doc, riesgo bajo — ver Sector 2).
