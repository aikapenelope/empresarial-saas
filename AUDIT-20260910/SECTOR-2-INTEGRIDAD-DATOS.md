# SECTOR 2 — INTEGRIDAD DE DATOS, TRANSACCIONES, LEDGERS + EDGE CASES
**Auditoría:** 2026-09-10 · HEAD `162bc64` · Modo: lectura

---

## RESUMEN EJECUTIVO DEL SECTOR

La arquitectura de integridad es **inusualmente sólida para un ERP joven**: advisory locks ordenados por (producto, almacén), idempotencia por kardex inmutable, `FOR UPDATE` en todas las recalculaciones, orden determinista de líneas, `runIsolatedContext` (una solución elegante a un bug real de fusión de context flags de Payload), y todos los 9 callers de `nextDocumentNumber` dentro de transacción. Los puntos débiles: (1) **`quotes` y `cash_closures` NO tienen unique constraint (tenant, número)** — la red de seguridad de BD está incompleta para 2 de las 9 colecciones; (2) **`createCashClosureAction` corre find+update SIN transacción** — carrera real entre cierre de turno y pagos en vuelo; (3) el costo ponderado ignora los reversos de anulación (entran con costo 0, no con costo original); (4) 12 actions single-doc sin transacción (riesgo bajo-moderado).

**Score Integridad: 7.5/10**

---

## 1. MATRIZ DE INVARIANTES DE NEGOCIO × GARANTÍA

| Invariante | ¿Garantizado por BD? | ¿Garantizado por código? | ¿NADA? |
|---|---|---|---|
| Número de documento único (invoices, customer-payments, production-orders, purchase-invoices, supplier-payments, orders, delivery-notes) | ✓ UNIQUE (tenant, número) — `document_number_uniques.ts:9-11`, `cxp_number_uniques.ts:8-9`, `add_orders.ts:54`, `add_delivery_notes.ts:55` | ✓ advisory lock + regex por transacción (`erpActions.ts:552-577`) | — |
| Número único en **quotes** | ✗ solo índice simple (`add_quotes.ts:115`) | ✓ advisory lock en transacción | **GAP si el advisory lock se salta** (p. ej. creación por REST admin panel) |
| Número único en **cash_closures** | ✗ solo índice simple (`add_cash_registers.ts:120`) | ✓ advisory lock en transacción | **GAP idem** |
| Kardex inmutable | ✓ escrito solo por hooks con `allowInternalStockUpdate`; delete bloqueado con movimientos (`salesInventory.ts:74-85`) | ✓ access create/update/delete `() => false` en colección (`StockMovements`) | — |
| Stock >= 0 (venta) | ✗ sin CHECK constraint | ✓ validación en beforeValidate del Kardex (exige saldo) — dentro de la transacción de la venta | ⚠ fuera de transacción no aplica |
| Stock >= 0 (producción) | ✗ sin CHECK constraint | ✓ `executeProductionOrder` valida bajo lock | ⚠ |
| `products.currentStock` = SUM(kardex) | ✗ desnormalizado | ✓ `recalculateProductTotalStock` con `FOR UPDATE` + `skipInventoryRecalculation` | ⚠ puede divergir si un hook falla a medias (auto-reparable recalculando) |
| Balance factura = total − pagos | ✗ desnormalizado | ✓ hooks de CustomerPayments recalculan con locks | ⚠ |
| Balance proveedor = SUM(facturas abiertas) | ✗ desnormalizado | ✓ `recalculateSupplierBalance` FOR UPDATE | ⚠ |
| Anulación marca cuotas cubiertas | — | ✓ documentado en `voidInvoiceAction:2273-2277` (balance→0 ⇒ pagado contablemente) | — |
| Tasa congelada por documento | ✓ `exchangeRateSnapshot` stored | ✓ snapshot al crear; se conserva en updates | — |
| Pago no excede saldo | ✗ sin CHECK | ✓ validado en action (`erpActions.ts:2580-2584`) + `applySupplierPaymentAllocations` | ⚠ solo capa aplicación |

**Diagnóstico:** los invariantes de dinero dependen de **recalculación desnormalizada con locks** — patrón correcto pero frágil ante: (a) escrituras por fuera de las actions (REST admin panel con roles con acceso), (b) bugs en hooks. Los unique constraints son la única garantía a nivel BD y **no cubren quotes/cash-closures**.

---

## 2. TRANSACCIONES — COBERTURA POR ACTION

**Con `withTransaction` (verificado):** createCustomer, importStock, transferStock, adjustStock, createInvoice (core), createQuote, updateQuoteStatus, convertQuoteToInvoice, createOrder, updateOrder (parcial), confirmOrder, cancelOrder, createPayment, createSupplierPayment, issueDeliveryNote, voidDeliveryNote, createPurchaseInvoice, receivePurchaseGoods, voidInvoice, openCashShift, createCashClosure*, executeProductionOrder, createInventoryCount, saveCountedItems, deleteCustomer (multi-doc), createTenant×.
(*createCashClosure ver hallazgo P1-S2-02 — llama withTransaction pero el find inicial corre FUERA.)

**SIN transacción (12 actions, todas single-doc o así compensadas):**
| Action | Línea | Riesgo |
|---|---|---|
| `ensureWalkInCustomerAction` | 206 | Bajo — create único; find-or-create con filtro name+tenant (carrera produce 2 walk-in, benigno) |
| `createProductAction` | 258 | Bajo — single create |
| `updateCustomerAction` | 2712 | Bajo — single update |
| `updateProductAction` | 2778 | **Medio** — el update dispara `priceHistoryHook` (beforeChange) + recálculos; si falla el hook, el update reverve (misma tx del doc) — OK en realidad: hooks corren en la tx del update. Bajo. |
| `updateQuoteAction` | 2874 | Bajo — single update |
| `inviteUserAction` | 2938 | Bajo — single create |
| `uploadReceiptAction` | 3005 | Bajo — single create media |
| `createCashRegisterAction` | 3124 | Bajo |
| `createSupplierAction` | 3393 | Bajo |
| `updateTenantSettingsAction` | 3440 | Bajo — single update |
| `createTenantAction` | 3500 | **Medio** — crea tenant + (posiblemente) miembro inicial: si es multi-doc, no atómico. Ver código: solo crea el tenant. Bajo. |

**Conclusión:** la falta de transacción en single-doc writes es aceptable (Payload envuelve cada operación en su propia tx). El problema real es solo `createCashClosureAction` (P1-S2-02).

---

## 3. HALLAZGOS DEL SECTOR

| ID | Severidad | Hallazgo | Evidencia | Impacto negocio | Esfuerzo |
|---|---|---|---|---|---|
| **P1-S2-01** | **P1** | `quotes` y `cash_closures` sin UNIQUE (tenant, número) — la red de seguridad de BD está incompleta: una carrera de numeración que escape del advisory lock (o una creación por REST admin panel, que NO corre `nextDocumentNumber`) produce números duplicados permanentes | `add_quotes.ts:115` (índice simple), `add_cash_registers.ts:120` (índice simple) vs las otras 7 colecciones con UNIQUE | Facturas/cotizaciones duplicadas rompen el libro de ventas y trazabilidad fiscal | **S** — migración: `CREATE UNIQUE INDEX quotes_tenant_quote_number_unique ON quotes (tenant_id, quote_number)` + idem cash_closures |
| **P1-S2-02** | **P1** | `createCashClosureAction`: el `find` del turno abierto corre FUERA de la transacción (`erpActions.ts:3168-3188`), y el update que cierra NO toma lock de fila del closure; entre el find y el update puede entrar un pago nuevo: el closure queda `closed` con systemTotals calculados sobre un turno que ya no refleja la realidad | `erpActions.ts:3168-3208` — find sin `req` de transacción, update sin `FOR UPDATE` del closure | Arqueo ciego con descuadre fantasma: el cajero cierra, entra un pago en vuelo, los systemTotals no lo incluyen → sobrante/faltante falso → decisiones de caja erradas | **M** — mover find+update dentro de `withTransaction` + `SELECT ... FOR UPDATE` sobre el closure antes de cerrar |
| **P1-S2-03** | **P1** | Costo ponderado ignora reversos de anulación: `revertSaleFromInventory` crea `sale_return` con `unitCostUSD: 0` — el reingreso no devuelve el costo al pool ponderado; tras una anulación, `costUSD` del producto queda penalizado solo por las compras (y los reversos entran a stock con costo 0 al calcular COGS de futuras ventas) | `salesLedger.ts:277-278` (`unitCostUSD: 0, totalCostUSD: 0`) + `updateProductWeightedCostOnPurchase:517-545` (solo pondera compras) | Costo promedio distorsionado tras anulación+recompra: márgenes y COGS de próximas ventas incorrectos | **M** — reversos con `unitCostUSD = costo snapshot de la venta original` (ya disponible en la factura) |
| **P2-S2-01** | **P2** | Stock >= 0 sin CHECK constraint en BD — la validación vive solo en beforeValidate del Kardex; un write por fuera de la action chain (REST admin con rol permitido) o un bug en hook permite stock negativo silencioso | Sin `CHECK (current_stock >= 0)` en migraciones; validación en `StockMovements/index.ts` beforeValidate | Inventario negativo = ventas fantasma, kardex inconsistente con la realidad física | **M** — CHECK constraint en products.currentStock + test del flujo venta-sobre-stock |
| **P2-S2-01b** | **P2** | `recalculateProductTotalStock` usa `FOR UPDATE` sobre products — orden de locks: advisory locks de saldos ANTES de row locks (bien en `applySaleStockDeduction:131-136`), pero `executeProductionOrder` y `applySaleStockDeduction` deben SIEMPRE tomar advisory locks en el MISMO orden global (producto asc). Verificado en venta ✓, producción ✓ (locks de insumos ordenados), pero importación de stock (`inventoryImport.ts`) usa `lockStockBalances` ✓. Sin deadlock encontrado hoy; documentar la regla como invariante | `inventoryLedger.ts:55-102` comentarios + verificación codegraph 7 callers | Deadlock A-B bajo carga si un flujo futuro invierte el orden | **S** — test de concurrencia + comentario de invariante en AGENTS.md |
| **P2-S2-02** | **P2** | Numeración manual: si un usuario introduce manualmente "FAC-00042" por el admin panel (REST create sin pasar por action), el regex del sistema lo considera en la secuencia (matchea `^FAC-[0-9]+$`) y `nextDocumentNumber` saltará a 43 — pero si introduce "FAC-99999", la próxima factura del sistema será FAC-100000 (salto masivo) | `erpActions.ts:566-576` — MAX sobre todo lo que matchee el formato | Secuencia de numeración manipulable/colisionable por input manual desde admin panel | **S** — (a) campo invoiceNumber readOnly en admin (custom field access), o (b) aceptar y documentar, o (c) prefix interno no adivinable |
| **P2-S2-03** | **P2** | `ensureWalkInCustomerAction` find-or-create sin lock: dos submits concurrentes crean DOS clientes "Consumidor Final" walk-in (duplicados benignos pero ensucian padrón) | `erpActions.ts:206` + filtro name+tenant | Padrón de clientes con walk-ins duplicados → reportes de cartera inflados | **S** — advisory lock `hashtext('walkin:tenantId')` o unique suave (name+tenant) con catch |
| **P2-S2-04** | **P2** | `voidInvoiceAction` marca cuotas cubiertas vía "balance→0 ⇒ pagado": contablemente discutible — una factura ANULADA con pagos previos parciales: ¿qué pasa con los pagos ya recibidos? El dinero recibido queda en customer-payments apuntando a una factura voided | `voidInvoiceAction:2273-2319` + `revertSaleFromInventory` | Conciliación fiscal: pagos huérfanos de facturas anuladas (devoluciones no modeladas) | **M** — política explícita: anular con pagos ⇒ exigir nota de crédito/devolución del pago primero |
| **P3-S2-01** | **P3** | `updateOrderAction` (l.1280) mezcla withTransaction (para business core) con updates sueltos; el update del pedido confirmed→confirmed con negocio cambiado exige `allowConfirmedOrderEdit` — bien; deuda solo de estilo | `erpActions.ts:1280-1330` | — | S |

---

## 4. MATRIZ DE EDGE CASES DEL SISTEMA (¿qué pasa HOY?)

| # | Operación | Escenario límite | ¿Qué pasa hoy? | Veredicto |
|---|---|---|---|---|
| 1 | POS / createInvoice | **Doble submit** (doble click, red lenta) | Cada submit crea SU factura con número distinto (advisory lock serializa, no deduplica) — NO hay idempotency key | ⚠ **P2: doble facturación por doble click.** Mitigación parcial: loading state en POSView. Fix: idempotency key client-generated que el server valide |
| 2 | POS checkout | Tasa cambia entre snapshot y commit | `resolveEffectiveRate` se llama UNA vez dentro de la transacción de creación (`createInvoiceCore`); snapshot queda congelado en el doc | ✓ CORRECTO |
| 3 | Factura | **void→reactivar→void** | `postSaleStockHook` (`salesInventory.ts:58-64`): void→reapply descarga; applySaleStockDeduction tiene idempotencia por kardex existente (`salesLedger.ts:85-90`); revertSaleFromInventory descuenta devoluciones previas (`:262-266`) | ✓ CORRECTO — no duplica reversos (probado en salesInventory.test.ts) |
| 4 | Devolución parcial + anulación total concurrente | Ambos toman advisory locks de saldo por (producto, almacén) ordenados; revertSaleFromInventory agrupa sale_out y descuenta sale_return previos bajo FOR UPDATE de la factura (`:212`) | ✓ CORRECTO — serializado por lock de factura |
| 5 | Numeración | Número manual "FAC-99999" desde admin | Salto de secuencia a 100000 (ver P2-S2-02) | ⚠ documentado arriba |
| 6 | Producción | Consumo BOM concurrente con venta del mismo producto | executeProductionOrder toma locks de insumos ordenados asc + FOR UPDATE de la orden; la venta toma locks por producto asc — MISMO orden global ⇒ no deadlock | ✓ CORRECTO (verificado orden en ambos flujos) |
| 7 | **Caja** | **Pago durante el cierre de turno** | find del turno ABIERTO fuera de transacción + update sin lock — carrera REAL (P1-S2-02). Además `computeShiftTransactions` corre en beforeChange del update: si el pago committea entre find y update, el systemTotals usa `closedAt` del cierre — el pago con fecha posterior a closedAt queda FUERA del arqueo pero el dinero sí entró | ✗ **P1-S2-02** |
| 8 | Import CSV | Fila con `__proto__` | Nosotros no parseamos CSV (rows vienen parseadas de UI); csv-parse vulnerable solo via plugin oficial import-export | ✓ neutralizado en nuestra capa |
| 9 | Compartición | Token de doc voided | El enlace sigue resolviendo + banner "Factura anulada" visible (`sharedDocStatusBanner`) | ✓ decisión consciente, correcta |
| 10 | Rate externo | Fetch falla total + sin tasa manual | `resolveEffectiveRate` → `rate: 1` silencioso (ver Sector 1 P2-S1-03) | ⚠ P2 |
| 11 | Rate externo | Tasa absurda (10^9) | Solo `val > 0` — sin bounds (Sector 1 P2-S1-02) | ⚠ P2 |
| 12 | Factura con lines quantity 0/negativas | Zod `invoiceItemSchema` valida quantity > 0 | ✓ (erpValidation) |
| 13 | Pago > saldo | Rechazado explícito (`erpActions.ts:2580-2584`) | ✓ |
| 14 | Cierre de caja doble click | find del turno abierto limit 1 + update a closed; el segundo submit no encuentra open → error claro "No hay un turno abierto" | ✓ CORRECTO (aunque sin tx, el error message cubre) |
| 15 | Producción quantityProduced = 0 | Rechazado (`inventoryLedger.ts:263`) | ✓ |
| 16 | Stock insuficiente en venta | beforeValidate del Kardex exige saldo dentro de la tx de la venta → rollback atómico con error claro | ✓ EXCELENTE |
| 17 | `adjustStockAction` con cantidad absurda | Zod bounds en erpValidation (ver max) | ✓ |
| 18 | Reactivar factura voided (status hack por REST) | REST update de invoices: el access de invoices restringe por rol; PERO `postSaleStockHook` se dispara en cualquier update status voided→issued: applySaleStockDeduction es idempotente por kardex | ✓ seguro |
| 19 | Import masivo con stock negativo resultante | `importStockToWarehouse` valida fila por fila en UNA transacción; válido se crea, inválido rechaza | ✓ documentado en comentario |
| 20 | Email auto-send falla | `maybeAutoSendInvoice` catch silencioso — la factura YA fue emitida; el email NO bloquea la operation | ✓ correcto patrón (after() + catch) |

---

## 5. MIGRACIONES (22 archivos) — VERIFICACIÓN

- **Reversibilidad:** todas las migraciones de índices/constraints tienen `down()` con DROP — ✓.
- **FK indexes:** verificados `invoices_items.product_id` (`add_sale_inventory:10`), `orders_items.product_id` + `orders.issued_invoice_id` (`add_orders:46,51`), tenant_id indexado en TODAS las tablas de negocio (verificado en quotes/delivery-notes/cash-closures arriba; patrón se repite).
- **Gaps:** quotes/cash-closures sin unique (P1-S2-01); sin CHECK stock >= 0 (P2-S2-01).
- **Drift schema vs payload-types.ts:** CI corre `pnpm migrate` + typecheck en cada PR — el drift se previene por pipeline.

---

## 6. "QUÉ TAN ROBUSTO ES" — VEREDICTO DEL SECTOR

**Fortalezas estructurales (nivel producción):**
1. Idempotencia por kardex inmutable (`salesLedger.ts:84-90`) — patrón ledger correcto.
2. Advisory locks con orden global documentado y verificado en los 3 flujos (venta, producción, import).
3. `runIsolatedContext` (`requestContext.ts:21-34`) — solución correcta y bien documentada a un bug real del merge de context de Payload (síntoma histórico: solo el primer producto recalculaba).
4. Todos los hooks pasan `req` (43/43 — Sector 0).
5. Snapshot de tasa congelado por documento.
6. Transacciones en todas las operaciones multi-doc críticas (venta, compra, pago, producción, cierre de apertura).

**Debilidades (por orden de riesgo):**
1. Unique constraints incompletos (quotes, cash-closures) — red de seguridad BD con huecos.
2. Carrera cierre de caja vs pago en vuelo (find fuera de tx).
3. Costo ponderado sin reversos (distorsión silenciosa de márgenes).
4. Sin idempotency key en POS (doble click = doble factura).
5. Sin CHECK constraints de invariantes de negocio en BD (todo es aplicación).
