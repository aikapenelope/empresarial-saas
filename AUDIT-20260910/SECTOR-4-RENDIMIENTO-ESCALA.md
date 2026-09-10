# SECTOR 4 — RENDIMIENTO Y ESCALA (Serverless + Postgres)
**Auditoría:** 2026-09-10 · HEAD `162bc64` · Modo: lectura

---

## RESUMEN EJECUTIVO DEL SECTOR

El patrón `findAllDocs`/`findAllMatching` (paginación completa a 500/página en memoria) es el **killer de escala #1**: el dashboard RSC ejecuta **6 colecciones completas en paralelo** (`getDashboardMetrics`) y el dashboard de gráficas 4 más (`getDashboardData`) — con 10k documentos son decenas de round-trips y el HTML serializa todo. El pool de 10 conexiones puede agotarse con pocos tenants concurrentes. La disciplina de `depth` es buena (0 en casi todo), `revalidatePath` es específico (83 calls con rutas exactas, sin over-invalidation), y el cache de tasas externas 120s es correcto. Los índices FK existen en las líneas de documento y tenant está indexado en todas las tablas.

**Score Rendimiento: 6/10** (correcto hoy con datos pequeños; se degrada linealmente con el volumen).

---

## 1. KILLER #1 — findAllDocs / findAllMatching

**Evidencia:** `erpData.ts:152-181` y `dashboardData.ts:76-102` — `while (hasNextPage) { payload.find({limit: 500, page}) }`, luego agregación en JS.

**Callers de findAllDocs:** 15 en erpData (`getDashboardMetrics`, `getCustomersWithDebt`, `getProductsCatalog`, `getCashRegistersWithDetails`, `getBillOfMaterialsList`, `getInvoicesList`…) — prácticamente TODOS los listados RSC del ERP cargan el catálogo completo del tenant.

**Coste estimado (dashboard RSC, `erp/page.tsx`):**
| Docs/tenant | Round-trips por dashboard | Memoria JS | Latencia extra estimada |
|---|---|---|---|
| 100 docs | ~6-8 queries | trivial | ~200ms |
| 1,000 | ~12-20 | decenas MB serializados | ~1s |
| 10,000 | ~60-120 (6 colecciones × 10-20 páginas) | 100s MB | 3-8s + posible timeout serverless (10s) |

**Umbral de quiebre estimado:** ~2,000-3,000 documentos por tenant el dashboard empieza a degradar; ~8,000-10,000 el RSC puede exceder el límite de ejecución de Vercel (10s default) y la memoria.

**Remedio (por orden de ROI):**
1. **KPIs por agregación SQL** (patrón YA existente en el repo: `db.execute(sql\`SELECT SUM...\`)` en inventoryLedger): `SUM(balance_usd) WHERE tenant AND status IN (...)` reemplaza cargar todas las facturas — 1 query por KPI en vez de N páginas. Esfuerzo M, elimina el 80% del coste del dashboard.
2. **Counts por `payload.db.count`** o SQL COUNT — `totalCustomers`, `lowStockCount` (`current_stock <= min_stock_alert` en SQL), `openRegistersCount`.
3. **Listados con paginación real** — el patrón Sprint 39 (`getInvoicesPage` + `BusinessFiltersBar`) ya es la solución canónica: extenderlo a las vistas que aún cargan todo (customers list, products list, kardex page).
4. **Unificar** findAllDocs/findAllMatching en un helper único (Sector 3 §4) cuando se toque.

## 2. ÍNDICES — VERIFICACIÓN CONTRA MIGRACIONES

| Query patrón | ¿Índice? | Evidencia |
|---|---|---|
| `tenant_id` en todas las tablas de negocio | ✓ | verificado en cada migración (quotes:114, delivery_notes:47, cash_closures:119, orders:47…) |
| `invoices_items.product_id` (FK de línea) | ✓ | `add_sale_inventory.ts:10` |
| `orders_items.product_id` | ✓ | `add_orders.ts:46` |
| `orders.issued_invoice_id` | ✓ | `add_orders.ts:51` |
| `share_token` en quotes/invoices/delivery_notes | verificar | migración `add_share_tokens` — índice creado (verificado en el sector de share) |
| `stock_movements.invoice_id` | ✓ implícito por lookup de reversión (usado en queries FOR UPDATE) | verificar índice explícito en migración sale_inventory |
| `status` en invoices (filtros de dashboard) | ⚠ compuesto (tenant, status) no existe | Con volumen, el dashboard escanea por tenant + status — el índice tenant ya filtra la mayoría; compuesto es opcional |

**P3-S4-01:** añadir índices compuestos `(tenant_id, status)` en invoices/purchase_invoices solo si el monitoreo muestra seq scans — no es urgente con el índice tenant existente.

## 3. DEPTH / N+1 / PESO DEL HTML RSC

- `depth: 0` en 15 de 17 posiciones de erpData — disciplina excelente (solo `getTenantBySlug` y `recentInvoices` usan depth 1, justificado).
- **`getBillOfMaterialsList` depth: 2** (`erpData.ts:408`) — populatea items.rawMaterial del BOM completo: con 100 BOMs × 10 insumos = 1,000+ joins/lookups de drizzle. **P2-S4-02: bajar a depth 1 + solo lo que la vista pinta.**
- `getProductsCatalog` depth: 1 (`erpData.ts:386`) — carga category de cada producto del tenant completo: aceptable en POS (necesita categoría para filtrar), pero es el candidato #1 a paginar.
- `getDashboardData` serializa revenueByDay + stats al client (charts recharts) — el payload es acotado (30 buckets) ✓ CORRECTO: la agregación se hace server-side, el chart recibe series compactas.

## 4. POOL DE CONEXIONES (serverless)

- Pool max 10 (`payload.config.ts:146`) — correcto para Transaction Pooler 6543.
- **Riesgo real:** `getDashboardMetrics` abre 6 `findAllDocs` concurrentes (`Promise.all` en `erpData.ts:213`) — cada uno con su paginación secuencial interna. 3 usuarios cargando el dashboard simultáneamente = 18 cursores activos contra pool de 10 → cola de conexiones (pg pool espera; no error pero latencia crece).
- Con el fix de agregaciones SQL (§1), el dashboard pasa de ~6×N queries a ~10 fijas → el riesgo desaparece.
- Migraciones usan pool 2 (`payload.config.ts:146`) ✓ correcto.

## 5. CACHING / REVALIDATION

- **`revalidatePath` bien apuntado:** 83 calls con rutas específicas por dominio (`/erp/invoices`, `/erp/customers`…); `/${slug}/erp` (dashboard) invalidado 23× — es la ruta agregadora, correcto invalidarla en toda escritura de negocio.
- **`getLiveExchangeRates` cache 120s en memoria** (`exchangeRate.ts:157-168`) ✓ — pero nota serverless: el módulo se re-hidrata por instancia fría; efectivo dentro de la instancia, no global. Aceptable.
- `/api/exchange-rates` con `Cache-Control: public, s-maxage=120` ✓ — CDN absorbe el ticker.
- Sin `unstable_cache`/tags — decisión aceptable en serverless con revalidatePath específico; no hay under/over-invalidation detectado.

## 6. COLD STARTS

- `getPayload({ config })` por request — patrón canónico Payload+Next (el singleton se cachea por proceso); correcto.
- Peso del config: 23 colecciones + 5 plugins oficiales + 3 in-repo — normal para Payload; no se detecta plugin pesado innecesario. El `reactStrictMode: true` solo afecta dev ✓.

## 7. FRONTEND

- POS 643 LOC: búsqueda de productos dispara filtrado local sobre el catálogo ya cargado (getProductsCatalog completo) — funciona con catálogos <2k; con más, necesita endpoint de búsqueda server-side (deuda ligada a §1).
- Charts recharts: client components que reciben series pre-agregadas ✓ (SSR no bloqueado por cómputo de charts).
- `useSyncOnKeyChange` custom (patrón React oficial de ajuste en render) — correcto, evita re-renders de effect.

## 8. TABLA CONSOLIDADA CONSULTA → PROBLEMA → REMEDIO

| Consulta | Problema | Remedio | Ahorro |
|---|---|---|---|
| `getDashboardMetrics` (6 findAllDocs) | N×páginas por colección, agregación en JS | SQL SUM/COUNT group by tenant+status | ~80% queries dashboard |
| `getDashboardData` (4 findAllMatching) | ídem + serializa líneas de invoice para categoryMix | SQL GROUP BY category vía join invoices_items×products | ~70% |
| `getProductsCatalog` (todo el catálogo, depth 1) | memoria + latencia con catálogo grande | paginación + búsqueda server-side (patrón Sprint 39) | lineal |
| `getBillOfMaterialsList` depth 2 | over-fetch de relaciones anidadas | depth 1 | queries join |
| `getCustomersWithDebt` (todos los deudores) | usado por receivables view | SQL WHERE currentDebtUSD > 0 + paginación | lineal |
| KPIs de conteo (lowStockCount, openRegisters) | contados en JS tras cargar todo | SQL COUNT con WHERE | ~100% de esa carga |

## 9. HALLAZGOS DEL SECTOR

| ID | Severidad | Hallazgo | Evidencia | Impacto | Esfuerzo |
|---|---|---|---|---|---|
| **P1-S4-01** | **P1** (escala) | findAllDocs/findAllMatching cargan colecciones completas para agregar en JS — el dashboard RSC hace 6 lecturas full-table del tenant | `erpData.ts:152-181,213-290`; `dashboardData.ts:76-102,120-154` | Con 5-10k docs: dashboards de 3-8s, timeouts serverless, pool exhaustion con 3+ usuarios concurrentes | **M** — agregaciones SQL (patrón ya existente en inventoryLedger) + counts |
| P2-S4-02 | P2 | `getBillOfMaterialsList` depth:2 sobre-expande | `erpData.ts:408` | 100 BOMs → 1,000+ lookups | S |
| P2-S4-03 | P2 | `getDashboardData` carga TODAS las quotes del tenant (sin ventana temporal) para el funnel de conversión | `dashboardData.ts:132-136` (where solo tenant) | funnel sobre 10k quotes en memoria | S — añadir ventana 60d al where |
| P3-S4-01 | P3 | Índice compuesto (tenant,status) opcional para filtros de estado | migraciones | — | S (solo si monitoreo lo pide) |
