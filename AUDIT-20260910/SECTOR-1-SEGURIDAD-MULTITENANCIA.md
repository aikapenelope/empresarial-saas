# SECTOR 1 — SEGURIDAD Y MULTI-TENANCIA
**Auditoría:** 2026-09-10 · HEAD `162bc64` · Modo: lectura

---

## RESUMEN EJECUTIVO DEL SECTOR

El aislamiento multi-tenant es **sólido en la capa de datos**: 44/44 Server Actions pre-autorizan con `requireErpTenantAccess`, el ERP layout es fail-closed, y los route handlers de reportes/exports verifican sesión + rol. La rehidratación del usuario desde BD por request (no solo JWT) es una fortaleza real contra tokens stale. Los riesgos del sector son: (1) el **CVE de account-unlock sin parche** que aplica directamente (Users.ts sin `auth.maxAttempts` ni `access.unlock`), (2) **11 vulnerabilidades de dependencias** con 2 critical en `next@16.3.0`, (3) tasas externas **sin sanity bounds** (una API comprometida = tasas absurdas propagadas a snapshots de documentos), y (4) sin `middleware.ts` — la defensa es per-route/action, correcta hoy pero frágil ante rutas futuras.

**Score Seguridad: 7/10**

---

## 1. MODELO DE AMENAZAS RESUMIDO

| Boundary | Superficie | STRIDE | Mitigación hoy | Veredicto |
|---|---|---|---|---|
| Internet → /share/* | Página pública por token (24 bytes CSPRND, base64url ≈ 192 bits) | Spoofing/Info disclosure | Token = capacidad sin sesión; lookup con `overrideAccess: true` intencional y documentado (`documentSharing.ts:167-169`) | ✓ ADECUADO — 2^192 no enumerable; timing-safe comparison no aplica (no hay comparación manual: es un WHERE equals indexado en BD — la BD compara) |
| Internet → /api/exchange-rates | Route público | Info disclosure / DoS (coste) | Cache 120s en memoria + `Cache-Control: public, s-maxage=120` (`route.ts:22`) | ✓ CONSCIENTE — es el ticker público del header del ERP (usa tasas Venezuela, no datos del tenant). Con `refresh=true` fuerza fetch externo — **sin rate limit: un atacante puede forzar fetch masivo a las 3 APIs externas** (P2-S1-01) |
| Internet → REST /api/* (Payload) | Todas las colecciones | Escalada / enumeración | Access functions por colección: `read: Boolean(user)` + multiTenantPlugin row filter | ✓ — ver P1-S1-02 (unlock) |
| Usuario autenticado → cuentas ajenas | `POST /api/users/unlock` | Escalada de privilegios | **NINGUNA** — Users.ts no define `access.unlock` | ✗ **P1-S1-02 — CVE sin parche** |
| Usuario tenant A → datos tenant B | 44 actions, RSC pages, reports | Info disclosure | `requireErpTenantAccess` + where tenant + multiTenantPlugin access | ✓ VERIFICADO en 44/44 actions + 6 route handlers + layout |
| Usuario autenticado → admin panel | Admin de Payload | Escalada | `role` con `saveToJWT: true` + field access create/update super-admin only (`Users.ts:69-75`)); tenant-admin solo puede crear users vía `inviteUserAction` (context flag) | ✓ FUERTE — anti-escalación bien pensada |
| Operador → fuga de datos vía export | CSV exports de reportes + import-export plugin | Info disclosure | ERP_REPORT_ROLES para exports; import-export restringido a admins | ✓ |
| Emails salientes | HTML autocontenido | XSS (email clients) | `escapeHtml` en TODOS los campos interpolados (`documentSharing.ts:368-375` — & < > " ' completos) | ✓ |
| CSV downloads | Fórmulas Excel (DDE) | Client-side attack | `csvCell` neutraliza `= + - @ \t \r` con prefijo `'` (OWASP) (`csv.ts:19-21`) | ✓ EXCELENTE — centralizado para todos los exports |
| Fetch externo de tasas | 3 proveedores hardcodeados | SSRF | URLs fijas (ve.dolarapi.com, pydolarve.org, p2p.binance.com) — sin input de usuario en la URL | ✓ No hay SSRF (no hay URL user-controlled) |

---

## 2. VERIFICACIÓN DE HALLAZGOS PREVIOS

| # | Hallazgo previo | Veredicto | Detalle |
|---|---|---|---|
| 1 | next@16.3.0 RCE x2 critical | **CONFIRMADO** | `pnpm audit`: 2 critical RCE unauthenticated (>=16.0.0 <16.3.3). El repo está en 16.3.0 → dentro del rango vulnerable. Mitigación parcial: `next.config.ts` no expone middleware de imagen custom y Vercel maneja infra; pero el CVE es de Next.js mismo. **P1-S1-01: bump a 16.3.3+ es obligatorio antes de producción.** |
| 2 | Payload account-unlock CVE | **CONFIRMADO + AMPLIADO** | Ver P1-S1-02 abajo. |
| 3 | csv-parse prototype pollution | **ALCANCE REDUCIDO — no es nuestro** | csv-parse 5.6.0 llega SOLO vía `@payloadcms/plugin-import-export` (oficial, pinneado 3.88.0). Nosotros NO parseamos CSV de entrada (`src/utilities/csv.ts` es solo export con `csvCell`; `inventoryImport.ts` recibe rows ya parseadas desde la UI). El vector real: upload de CSV en el admin panel por tenant-admin (superficie del plugin oficial). La fix real es upstream (bump del plugin cuando Payload actualice). **Reclasificado a P2-S1-04 (monitoreo upstream).** |
| 4 | sharp/esbuild/dompurify | CONFIRMADO sin exposición crítica | sharp 0.34.2 (2 high, libvips/libheif — solo aplica si se procesan imágenes maliciosas via Media; con S3 storage y sharp para thumbs — exposición baja pero real); esbuild dev-only (0 impacto prod); dompurify via monaco-admin (solo admin panel). **P2 — bump sharp >=0.35.4 con el próximo bump de Payload.** |
| 5 | importExportPlugin reemplaza access | **CONFIRMADO** | Detallado en Sector 0 (P2-S0-03). Riesgo de seguridad residual: el access override define `update: super-admin` para products — un tenant-admin NO puede mutar productos por REST (bien), pero el ERP actions usan overrideAccess interno — el override NO crea un agujero, solo restringe el admin panel. |
| 6 | Sin middleware.ts | **CONFIRMADO — riesgo estructural, no bug** | La defensa per-route es consistente (6/6 route handlers con requireErp*, layout fail-closed). El middleware opcional de Payload 3.88 existiría como hardening extra. P3 — decisión arquitectónica documentable. |

---

## 3. HALLAZGOS DEL SECTOR (priorizados)

| ID | Severidad | Hallazgo | Evidencia | Impacto negocio | Esfuerzo |
|---|---|--- |---|---|---|
| **P1-S1-01** | **P1** | `next@16.3.0` dentro del rango vulnerable de 2 CVEs de **RCE no autenticado** (parche 16.3.3) | `package.json:48` (`next: 16.3.0`) + `pnpm audit` | RCE no autenticado = compromiso total del sistema en producción | **S** — bump patch `16.3.3+` + validar `payload build` (sin breaking, es patch) |
| **P1-S1-02** | **P1** | `Users.ts` sin `auth.maxLoginAttempts`/`lockTime` y sin `access.unlock` — CVE de Payload 3.88.0: "default account-unlock access allows authenticated users to reset other accounts' lockouts" — cualquier usuario autenticado (incl. employee de un tenant) puede desbloquear cualquier cuenta bloqueada (incl. super-admin) via `POST /api/users/unlock/:id`. Corrección de propiedad: Payload usa `maxLoginAttempts` (docs oficiales authentication/overview.mdx); columnas `login_attempts`/`lock_until` ya existen (`init_core.ts:46-47`) — sin migración | `src/collections/Users.ts:4-78` — cero config auth | Desbloquear cuentas facilita brute-force persistente; combinado con fuerza de credentials sobre super-admin = toma de plataforma | **S** — `auth: { maxLoginAttempts: 5, lockTime: 1800000 }` + `access.unlock: ({ req: { user } }) => user?.role === 'super-admin'` (no `() => false`: el admin panel de super-admin conserva la vía de desbloqueo; el flujo forgot-password de Payload no pasa por la operación unlock y sigue funcionando para auto-recuperación) |
| **P2-S1-01** | **P2** | `/api/exchange-rates?refresh=true` sin rate limit ni auth: cada hit con refresh fuerza 3 fetches externos (Binance P2P POST + 2 GETs), saltándose el cache de 120s | `route.ts:9` + `exchangeRate.ts:157-160` (forceRefresh ignora cache) | DoS a las APIs externas desde nuestra IP (ban de Binance API) + coste serverless; un bot puede pulsar refresh masivamente | **S** — rate limit simple (token bucket en memoria por instancia o `s-maxage` también en refresh con coalescing) |
| **P2-S1-02** | **P2** | Tasas externas sin sanity bounds superiores: `fetchBCVRate`/`fetchParaleloRate` solo validan `val > 0` — una API comprometida/troll que devuelva 10^9 o 0.5 genera snapshots de tasa absurdos en facturas creadas durante la ventana | `exchangeRate.ts:68,100` (solo `val > 0`) | Facturas con totalVES disparatado; si BCV real ≈ 100 Bs/USD, una tasa 0.01 = documentos VES 10,000× más caros | **S** — bounds razonables (ej. 1 < rate < 100,000) + alerta si fuente discrepa >30% de la mediana entre fuentes |
| **P2-S1-03** | **P2** | `resolveEffectiveRate` fallback silencioso a `rate: 1` (`default_unit`) — si TODAS las fuentes fallan y no hay tasa manual, una factura se emite con tasa 1.0 (total VES = total USD) | `exchangeRate.ts:238-239` | Factura bimonetaria con tasa 1:1 emitida sin advertencia — error silencioso de negocio en Venezuela (VES ≈ 100× USD) | **M** — rechazar emisión con autoSync y sin fuentes vivas (o tasa manual obligatoria), en vez de 1.0 |
| **P2-S1-04** | **P2** | csv-parse 5.6.0 (prototype pollution) via plugin oficial import-export; sin fix nuestra posible — depende de Payload upstream | `pnpm why csv-parse` → `@payloadcms/plugin-import-export 3.88.0` | Upload CSV por tenant-admin en admin panel es el vector; sanitización de rows del plugin es la defensa actual | **S** — añadir ISSUE-tracking: bump Payload cuando saque fix; mitigación: limitar import-export a super-admin (cambio de access) |
| P3-S1-01 | P3 | Sin `middleware.ts` central | estructura src/app | Defensa per-route consistente hoy; fragilidad ante rutas futuras | S — opcional: middleware que exija sesión para /{tenant}/erp/* como belt-and-suspenders |
| P3-S1-02 | P3 | `SUPABASE_ROOT_CA` embebida en `src/constants/supabaseCa.ts` (bundle) | constants/supabaseCa.ts | Un certificado público Root CA no es secreto (es público por diseño); cero riesgo real | — (documentar) |

---

## 4. AISLAMIENTO TENANT — VERIFICACIÓN EXHAUSTIVA

**Superficie verificada (todas con `requireErpTenantAccess` / `getTenantBySlug` con sesión):**
- 44 Server Actions (41 erpActions + 3 shareActions) — patrón: Zod parse → requireErpTenantAccess → withTransaction. Verificado por conteo grep + codegraph (41 callers de ErpAccessError).
- 6 route handlers: `pricing/report`, `reports/sales-book/export`, `reports/aging/export`, `reports/kardex/export`, `inventory/import/template` — todos con requireErp + ERP_REPORT_ROLES donde corresponde. `api/exchange-rates` es público por diseño (ticker, no tenant data).
- ERP layout fail-closed: tenant lookup falla → ErpAccessDenied; catch de ErpAccessError → status correcto (`layout.tsx:26-34`).
- `getErpUser` rehidrata desde BD (no confía en claims JWT para tenants/role) — **fortaleza**: si se revoca membresía, el siguiente request ya no ve el tenant.
- `audit.ts:109-121`: eventos globales (tenant null) solo super-admin; tenant-admin ve `tenant in tenantIds`.
- Import/export plugin: access read/create restringido a super/tenant-admin (`payload.config.ts:276-301`).

**Matriz edge-case de aislamiento (skill ACCESS-CONTROL-ADVANCED §Test Edge Cases):**

| Escenario | ¿Qué pasa hoy? | Veredicto |
|---|---|---|
| No user (anónimo) | Layout → ErpAccessDenied 401; actions → ErpAccessError 401; REST → access false | ✓ fail-closed |
| Wrong user (tenant ajeno) | requireErpTenantAccess → 403 "no tiene acceso a este inquilino" | ✓ |
| Admin user (super-admin) | userHasAccessToAllTenants → acceso global | ✓ |
| JWT stale (membresía revocada) | getErpUser rehidrata desde BD → 403 | ✓ fortaleza |
| Token de share revocado (doc voided) | resolveSharedDocument resuelve + banner de estado final visible (`sharedDocStatusBanner`) | ✓ decisión consciente: el enlace sigue, la verdad del ciclo visible |
| Session hijack (cookie robada) | Sin 2FA/MFA, sin device binding | ⚠ fuera de alcance v1 (P3) |

---

## 5. INYECCIÓN SQL — VERIFICACIÓN

- Queries crudas usan `sql` template de drizzle con binding parametrizado: verificado en `inventoryLedger.ts`, `salesLedger.ts`, `shareActions.ts:98` (`sql.identifier(table)` para el nombre de tabla + `${documentId}` parametrizado).
- `nextDocumentNumber` (`erpActions.ts:568-572`): usa `sql.raw(column)` y `sql.raw(table)` para NOMBRES de tabla/columna — **seguro**: provienen de `DOC_NUMBER_TABLES[collection]`, un mapa constante interno (no user input); `${tenantId}` y `${prefix}` van parametrizados. El regex del WHERE (`'^' || prefix || '-[0-9]+$'`) concatena `prefix` como parámetro — seguro.
- CSV exports: `csvCell` neutraliza fórmulas + quotes escapadas — sin inyección.

**Veredicto SQL injection: SIN HALLAZGOS.**

## 6. XSS — VERIFICACIÓN

- Emails HTML: `escapeHtml` completo (& < > " ') en tenantName, number, customerName, notes, line descriptions (`documentSharing.ts:289-324`).
- `shareUrl` interpolado sin escape en href (`:330`) — pero `shareUrl` se construye desde `PUBLIC_BASE_URL` + token base64url (sin chars peligrosos) — seguro por construcción.
- Página pública share: React JSX auto-escapa; `dangerouslySetInnerHTML` no encontrado en src (verificado).
- Admin panel: React oficial de Payload.

**Veredicto XSS: SIN HALLAZGOS.**

## 7. CSRF — VERIFICACIÓN

- Server Actions de Next.js 15/16: POST-only con Origin check nativo de Next (Server Actions bloquean cross-origin por defecto) + cookies SameSite de Payload (`payload-token` httpOnly).
- REST API de Payload para mutaciones: Payload 3 exige session; el CSRF de formularios del admin es manejado por el propio framework.
- Route handlers GET-only de exports: sin mutación.

**Veredicto CSRF: SIN HALLAZGOS (framework-native).**

## 8. HEADERS DE SEGURIDAD (next.config.ts)

`next.config.ts` NO define `headers()` — sin CSP, X-Frame-Options, HSTS propios. En Vercel, algunos son default (x-vercel-cache, etc.) pero **CSP no es default**.

**P2-S1-05: añadir security headers** (HSTS, X-Content-Type-Options, X-Frame-Options: DENY, Referrer-Policy, y CSP restrictiva para el app shell) — Esfuerzo S, reduce superficie XSS/ clickjacking.
