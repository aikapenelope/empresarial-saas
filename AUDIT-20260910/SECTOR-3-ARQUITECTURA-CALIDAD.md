# SECTOR 3 — ARQUITECTURA, CALIDAD DE CÓDIGO Y "CÓMO SE HABLAN LAS COSAS"
**Auditoría:** 2026-09-10 · HEAD `162bc64` · Modo: lectura

---

## RESUMEN EJECUTIVO DEL SECTOR

La constitución (AGENTS.md §2.1) se cumple de forma **excepcionalmente disciplinada**: cero violaciones de dirección de dependencias entre capas (collections nunca importan UI, utilities nunca importan UI, plugins sin cableado de UI). El grafo de comunicación es limpio y unidireccional. La deuda es de **tamaño, no de dirección**: 2 archivos dios (`erpActions.ts` 3,524 LOC con fan-in de 32 componentes; `erpData.ts` 2,137 con fan-in de 37), duplicación estructural de helpers de ledger (4 copies de `extractId`, 2 de `getUserTenantIds`), 20 modales con esqueleto repetido, y 25 casts `as unknown as` — de los cuales **al menos 5 son eliminables hoy** porque `payload-types.ts` ya tipa la shape castada (deuda pura, no estructural).

**Score Arquitectura: 7.5/10 · Score Calidad de código: 7/10**

---

## 1. CUMPLIMIENTO DE LA CONSTITUCIÓN (§2.1) — VEREDICTO POR CAPA

| Capa | Regla | Cumplimiento | Evidencia |
|---|---|---|---|
| Colecciones | `CollectionConfig` puro, sin acoplamientos | ✓ 23/23 | Cero imports a UI; hooks de dominio propios; cross-tenant checks vía utilities importadas (permitido: utilities es capa compartida) |
| Colecciones | Sin campos inyectados por plugins | ✓ | Los 3 plugins inyectan en runtime via map, las colecciones base no los declaran |
| Plugins | `(options) => (config) => Config` + `enabled` | ✓ 3/3 | Sector 0 §2 |
| Plugins | Sin lógica de negocio pesada | ✓ | salesInventory delega a salesLedger; pricing a exchangeRate/inventoryLedger; audit es wiring puro |
| Utilities | Lógica de negocio sin cableado UI/config | ✓ 24/24 | Cero imports de `@/components`; usan `@payload-config` solo para `getPayload` (getPayload no es cableado, es inicialización — aceptable, aunque merecería centralizarse) |
| Actions | Zod + requireErpTenantAccess + withTransaction | ✓ 44/44 Zod+auth; withTransaction donde multi-doc | Sector 2 §2 |
| UI | Consume Local API (RSC) y Server Actions (client) | ✓ | RSC pages → erpData; client modals → actions |
| Jobs | TaskConfig + usuario rehidratado | ✓ 2/2 | `seedIndustryTemplate:25` (overrideAccess false + RBAC real), `evaluateAlerts` (cron documentado) |

**Adherencia global: 100% en dirección, ~90% en consistencia** (con la salvedad de que el tamaño de erpActions/erpData dificulta navegarlo, no la corrección).

## 2. GRAFO DE COMUNICACIÓN (cómo se hablan las cosas)

Flujos críticos trazados con codegraph:

```
POS checkout:  POSView → createInvoiceAction → [Zod → requireErpTenantAccess → withTransaction]
               → createInvoiceCore → nextDocumentNumber (advisory lock)
               → payload.create(invoices) ─┬→ salesInventoryPlugin.postSaleStockHook (afterChange)
                                           │    → applySaleStockDeduction → lockStockBalances (orden asc)
                                           │    → create(stock-movements) [kardex inmutable]
                                           │    → StockMovements.afterChange → recalculateProductTotalStock
                                           │    → financeLedger.recalculateCustomerBalance
                                           └→ maybeAutoSendInvoice → after(prepared.send) [email async]
Emisión:       InvoiceModal → createInvoiceAction (idem)
Anulación:      InvoiceDetailActions → voidInvoiceAction → payload.update(invoices status voided)
               → postSaleStockHook → revertSaleFromInventory (FOR UPDATE + sale_return)
Import stock:  InventoryImportView → importStockAction → importStockToWarehouse (lockStockBalances)
```

**Direcciones verificadas:** UI→Actions→Utilities→BD y UI(RSC)→erpData→BD. Collections↛plugins. Plugins→Collections (inyección) + Utilities (lógica). Sin ciclos detectados. `erpActions → shareActions` (prepareDocumentEmail) es el único action→action — justificado (auto-send), no rompe la regla.

**Fan-in (blast radius real):**
- `erpData.ts`: 37 importers — el hub de lecturas. Cualquier cambio ahí toca media app.
- `erpActions.ts`: 32 importers — hub de escrituras.
- `inventoryLedger.ts`: 16 importers — el corazón de inventario, bien delimitado.
- `extractId`/`getUserTenantIds`: 4+2 definiciones duplicadas → consolidar en `inventoryLedger` (o un `src/utilities/ids.ts`) y re-exportar.

## 3. ARCHIVOS DIOS — PLAN DE DESCOMPOSICIÓN

| Archivo | LOC | Propuesta | Orden | Riesgo |
|---|---|---|---|---|
| `src/actions/erpActions.ts` | 3,524 | Split por dominio: `salesActions.ts` (invoice/quote/order/delivery), `purchasesActions.ts`, `cashActions.ts`, `inventoryActions.ts` (transfer/adjust/import/count), `catalogActions.ts` (customer/product/supplier), `adminActions.ts` (tenant/users/settings/alerts). Los helpers compartidos (`withTransaction`, `nextDocumentNumber`, `DOC_NUMBER_TABLES`, `toSafeActionError`) → `src/actions/_shared.ts` | 1º (el mayor) | BAJO: los imports son `import { x } from '@/actions/erpActions'` — se puede hacer con re-exports de compatibilidad (`export * from './salesActions'`) para no tocar 32 componentes de golpe |
| `src/utilities/erpData.ts` | 2,137 | Split por dominio: `erpDataSales.ts`, `erpDataCatalog.ts`, `erpDataAdmin.ts` + `findAllDocs` compartido | 2º | BAJO idem |
| `src/utilities/erpValidation.ts` | 678 | Split alineado con los actions (zod schemas viven junto a su dominio) | 3º | BAJO |
| `POSView.tsx` | 643 | Extraer hook `usePOS` + subcomponentes (cart, payment, product picker) | 4º | MEDIO (client state) |
| `PurchaseInvoices/index.ts` | 633 | La colección tiene hooks de ledger; extraer hooks a `src/utilities/purchasesLedger.ts` (ya existe) | 5º | MEDIO |

**Estimación de simplificación:** ~1,500 LOC eliminables por consolidación (duplicación de helpers de ledger, modal skeleton, findAllDocs/findAllMatching unificados).

## 4. DUPLICACIÓN ESTRUCTURAL

1. **`extractId` ×4** (`financeLedger:24`, `purchasesLedger:25`, `inventoryLedger:15`, `cashLedger:78`) + `getUserTenantIds` ×2 — idénticos. → 1 módulo `src/utilities/ids.ts`, -60 LOC.
2. **`findAllDocs` (erpData:152) vs `findAllMatching` (dashboardData:76)** — misma paginación 500/página copiada. → extraer a `src/utilities/paginatedFetch.ts`. (También resuelve el patrón para el fix de rendimiento del Sector 4.)
3. **20 modales** con el mismo esqueleto (loading/error/handSubmit/useState pattern — 4-15 hooks cada uno). Ya existe `Modal.tsx` base. → extraer `ModalForm` genérico (children + onSubmit + loading + error) — ahorra ~400-600 LOC y unifica UX de errores.
4. **Casts `user.tenants` ×5** (`erpData:109`, `erpAuth:63`, `Customers:158`, `Products:155`, `IndustryTemplates:170`) — **el cast es innecesario**: `payload-types.ts:242-247` ya define `User['tenants']` con esa exacta shape. → reemplazar por `user.tenants ?? []` tipado. Deuda pura, cero riesgo.
5. **Casts db adapter ×4** (`financeLedger:41`, `purchasesLedger:60`, `inventoryLedger:32`, `shareActions:94`) — drizzle type no exportado públicamente; centralizar en `getActiveDb` ya existe — los 4 definen el MISMO type inline. → mover al helper único.

## 5. TYPESCRIPT ESTRICTO — AUDITORÍA DE CASTS

25 casts `as unknown as` (excl. payload-types.ts). Clasificación:
- **Eliminables hoy (7):** 5× user.tenants (tipado existe) + `erpAuth:23` headers (Next `headers()` devuelve `ReadonlyHeaders` — cast a `Headers` documentado en Next 15+; tipable con spread) + `industryTemplates/validate:109` (tipo ya existe).
- **Estructurales-legítimos (18):** casts del db adapter drizzle (4), `withTransaction:89` req fake (necesita tipado de Payload internal — documentar), docs as Record en hooks (10) — tratables con genéricos de Payload 3.88 (`TypedDocument`), pero esfuerzo > beneficio hoy.

## 6. CÓDIGO MUERTO / DESPERDICIO

| Ítem | Evidencia | Acción |
|---|---|---|
| `INVOICE_SHARE_BLOCKED` | `shareActions.ts:60` — asignado, nunca leído (única warning de lint del repo) | Eliminar o comentar intención (Set vacío documental) |
| `Quicks.*` exports | verificado vía codegraph: los principales tienen callers | — |
| `getBillOfMaterialsList` depth:2 | over-fetch (Sector 4) | optimizar |

## 7. DOCS vs CÓDIGO (drift)

- ROADMAP refleja con precisión el estado: Sprint 39-44 marcados como hechos con referencias a PRs reales; "Pendiente Fase 10" honesto (paginación en pedidos/compras/pagos pendientes — confirmado: solo `getInvoicesPage`/`getQuotesPage`/`getOrdersPage` existen; `getPurchasesPage`/`getPaymentsPage` no).
- `docs/FASE-13-INVESTIGACION.md` y `ECOSISTEMA-VE-Y-PLUGINS.md` son investigación de roadmap — sin drift.
- AGENTS.md §5.1 (BD local 54322) verificado en `scripts/db-local.sh` (3 referencias al puerto correcto). §5.2 (PR de un push) — los merges en git log muestran el patrón respetado (PRs #26-#73).

## 8. TOP 10 OPORTUNIDADES DE SIMPLIFICACIÓN (code judo)

1. **Split erpActions por dominio** con re-exports de compatibilidad — -0 LOC neto pero navegabilidad + review speed.
2. **Consolidar extractId/getUserTenantIds** en 1 módulo — -60 LOC, 1 fuente de verdad.
3. **Unificar findAllDocs/findAllMatching** en helper paginado — -40 LOC + base para SQL aggregation futura.
4. **ModalForm genérico** — -400 a -600 LOC, UX de errores unificada.
5. **Eliminar casts user.tenants** — tipado gratis del generado.
6. **Mover type del db adapter** a `getActiveDb` — 4 definiciones inline → 1.
7. **`toastError(result)` helper** — el patrón `if (!res.success) { toast.error(res.error) }` aparece en todos los modales → 1 helper.
8. **Extraer `usePOS`** de POSView — testabilidad del flujo más crítico.
9. **Enums de estados como const objects compartidos** — `STOCK_COMMITTING_STATUSES`, `FINAL_STATUSES` re-declarados por dominio; unificar en `src/constants/erpStatus.ts` (nuevo hogar legit para constantes de dominio cruzado).
10. **Delete INVOICE_SHARE_BLOCKED** + pasar `eslint` a cero warnings (hoy 1).

## 9. HALLAZGOS DEL SECTOR

| ID | Severidad | Hallazgo | Evidencia | Impacto | Esfuerzo |
|---|---|---|---|---|---|
| P2-S3-01 | P2 | Archivos dios: erpActions 3,524/41 actions (umbral repo 1k), erpData 2,137 | ver §3 | Review velocity, merge conflicts, onboarding | M (por etapas, re-exports) |
| P2-S3-02 | P2 | Duplicación de helpers de ledger (extractId×4, getUserTenantIds×2, db adapter type×4) | ver §4 | Divergencia silenciosa: un extractId con bug se fixea en 1 de 4 | S |
| P2-S3-03 | P2 | 5 casts user.tenans innecesarios (tipo existe en payload-types) | §5 | Falsa impresión de tipado roto; fricción de lectura | S |
| P2-S3-04 | P2 | 20 modales con esqueleto duplicado | §4 | -500 LOC y UX de error inconsistente | M |
| P3-S3-01 | P3 | INVOICE_SHARE_BLOCKED muerto | shareActions.ts:60 | ruido | S |
| P3-S3-02 | P3 | Estados/const de dominio re-declarados | STOCK_COMMITTING_STATUSES etc. | drift potencial | S |
| P3-S3-03 | P3 | Paginación pendiente en compras/pagos (deuda Fase 10 conocida) | ROADMAP:319 | escala de listados | M (ya planeado) |
