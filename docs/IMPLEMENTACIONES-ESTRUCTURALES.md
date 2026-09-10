# Implementaciones Estructurales — Plan Detallado de 8 Sprints

> Documento de planificación (post-investigación de brechas vs. Cendaro). Complementa
> [`FASE-13-INVESTIGACION.md`](./FASE-13-INVESTIGACION.md): aquel cubre infraestructura
> (Render, escala, PWA, RLS); este cubre las features de producto y gobernanza aprobadas
> para implementación. Solo documentación — cero código de producción.

---

## 1. Contexto y alcance

Del análisis de brechas contra Cendaro (ERP omnicanal de referencia, `/orca/Cendaro1`:
Next.js 16 + tRPC + Drizzle + Supabase) se identificaron 11 gaps y 10 puntos de mejora.
Tras debatirlos punto por punto, el usuario aprobó implementar **8 items** (el 9.º,
auditoría con diff, se retiró al verificar que ya está completo). Este documento fija,
para cada uno: el estado real verificado en el código, el diseño propuesto, las
migraciones necesarias, los riesgos y los blindajes.

**Verificación previa obligatoria antes de codificar** — hallazgos que corrigieron el
análisis inicial:

| Item | Corrección al análisis inicial |
|---|---|
| Auditoría old→new | **YA COMPLETO.** `auditPlugin` calcula el diff (`computeDiff`, `src/plugins/audit.ts:225`), guarda snapshot en create/delete y `AuditView` lo muestra (`AuditView.tsx:17`). Dado por cerrado. |
| Cuotas de crédito | **Backend YA EXISTE** (Sprint 12): `installmentsCount` 1–12 en `createInvoiceSchema` (`erpValidation.ts:78`), campo `installments` con dueDate/amountUSD/paidUSD/status (`Invoices/index.ts:452`) y hook de conciliación contra el balance (`Invoices/index.ts:183`). Faltan 3 residuales: UI del plan, alerta de cuota vencida y enforcement del límite. |
| Numeración documental | **NO ES GAP.** `nextDocumentNumber` (`erpActions.ts:552`) usa advisory lock transaccional + MAX (no COUNT, no recicla) + índice único (tenant, número). Más robusto que el trigger de Cendaro. |
| PaymentAllocation | **NO ES GAP.** El allocation FIFO de abonos ya existe (`financeLedger.ts`); en Cendaro esa tabla ni siquiera se escribe. |

**Patrones oficiales de Payload confirmados** (skill de Payload + Context7 `/payloadcms/payload`):

1. `payload.db.beginTransaction()` / `commitTransaction` / `rollbackTransaction` con
   `req: { transactionID }` — respaldo para operaciones bulk fuera de un request.
2. `payload.jobs.queue({ task, input })` desde hooks/tasks + `req.payload.sendEmail`
   dentro de un `TaskConfig` — para el email de alertas.
3. Relación polimórfica `relationTo: ['a','b']` existe, pero **no se puede filtrar por
   campos del documento destino** — por eso las aprobaciones usan el patrón
   `refCollection`/`refId` que ya consagró la colección `alerts`.
4. `previousDoc` disponible en `afterChange` (ya lo explota el auditPlugin).

---

## 2. Los 8 items, uno por uno

### Item 14 — Skeletons isomórficos por ruta + `Delayed`

**Estado verificado:** solo existe `dashboard-skeleton` y el `loading.tsx` del detalle de
factura (`invoices/[id]/loading.tsx`). Las demás rutas no tienen estado de carga con
forma.

**Diseño:**
- `src/components/erp/skeletons.tsx`: `ListSkeleton` (header + fila KPI + filtros +
  tabla de N filas, con formas que replican el layout real para CLS≈0),
  `DetailSkeleton` (promover el actual) y componente `Delayed` (no renderiza el
  skeleton si la respuesta llega en <200 ms — patrón NN/g que Cendaro aplica en todas
  sus rutas).
- `loading.tsx` finito (3–6 líneas) en las ~18 rutas de `src/app/(app)/[tenant]/erp/`,
  cada uno con la forma apropiada (lista vs. detalle vs. dashboard).

**Migración:** no. **Riesgo:** nulo (puro render, tokens del design system).

### Item 15 — EmptyState estándar

**Estado verificado:** estados vacíos dispersos como párrafos ad-hoc, inconsistentes
entre vistas.

**Diseño:** `src/components/erp/EmptyState.tsx` (icono + título + descripción + slot de
CTA opcional) y barrido por las vistas: facturas, cotizaciones, pedidos, remisiones,
clientes, cartera, inventario, kardex, conteos, compras, proveedores, caja, vendedores,
alertas, ticket vacío del POS.

**Migración:** no. **Riesgo:** nulo.

### Item 18 — POS keyboard-first (escáner de barras + atajos + vuelto)

**Estado verificado (`POSView.tsx`, 643 líneas):** el POS navega por `<select>` plano con
todos los productos; el campo `barcode` existe en Products (indexado,
`Products/index.ts:230`) pero la página del POS no lo mapea; no hay atajos de teclado ni
cálculo de vuelto. Este es el gap de mayor impacto: es el usuario núcleo (comercio al
detal venezolano) y el escáner es infraestructura estándar de bodega.

**Diseño:**
- **Buscador/escáner** al inicio de "Agregar Artículos", auto-focus al montar:
  - Coincidencia exacta por `barcode` o `sku` (trim, case-insensitive) → agrega la
    línea directamente y re-enfoca el input (flujo escáner).
  - Si no hay coincidencia exacta → dropdown filtrado por nombre/SKU (máx 8
    resultados, navegable ↑↓/Enter) que fija el producto seleccionado.
  - El `<select>` actual se conserva como ruta táctil/móvil.
  - La adición por escáner usa `effectivePriceForTier(prod, activeTier)` directamente,
    **sin pasar por el input manual de precio** — preserva la semántica Devin #52 (el
    campo de precio manual solo gobierna la vía del select; el 0 explícito = cortesía
    queda intacto).
- **Atajos:** F2 enfoca el escáner, F4 dispara "Cobrar y Facturar" (`useRef` + listener
  global de keydown; las F-keys no escriben texto, no interfieren inputs). ESC limpia
  la búsqueda.
- **Vuelto bimonetario:** con condición=contado y método=efectivo (USD o Bs), input
  "Entregado" → vuelto calculado en vivo en ambas monedas; si falta dinero, aviso en
  rojo. Cálculo puro de UI, **no viaja al backend** (el recibo automático del turno no
  cambia).
- `pos/page.tsx` añade `barcode` al mapeo de productos (`getProductsCatalog` ya
  devuelve docs completos — cero cambios en `erpData`).

**Migración:** no. **Riesgo:** bajo — el flujo select→agregar queda byte-idéntico; todo
es aditivo.

**Refinamientos decididos al implementar (2026-09-10):**
1. `barcode` es indexado pero NO único: con 2+ coincidencias exactas el escáner NO
   auto-agrega — el dropdown se restringe a las exactas para que el cajero elija
   (regla anti-duplicado; exacta única = agrega directo).
2. F4 invoca el MISMO `handleSubmit` del botón (ref de closure fresca reasignada por
   render): un solo camino de validaciones, el atajo no puede saltarse guardas
   (carrito vacío, turno cerrado, crédito sin cliente…).
3. Dropdown con semántica combobox/listbox ARIA (`role`, `aria-expanded`,
   `aria-activedescendant`, opciones con `role="option"`) — el estándar de teclado del
   sprint.
4. El escaneo repetido suma cantidad reutilizando la fusión de líneas existente
   (mismo producto + mismo precio de tier → +1), cero código de acumulación nuevo.
5. El vuelto aparece sólo con contado en efectivo USD/Bs y carrito con contenido; se
   limpia al completar la venta. Verificación contable: el cobro registrado es
   SIEMPRE el total de la factura, así que el arqueo (físico vs. sistema) cuadra sin
   registrar el vuelto.

### Item 17 — Command palette extendida

**Estado verificado (`CommandPalette.tsx`, 206 líneas):** busca rutas (solo por nombre) +
clientes + productos por REST; sin navegación por teclado, sin filtrado por rol, y el
resultado de producto cae en la lista de inventario.

**Diseño:**
- Navegación completa ↑↓/Enter con índice activo sobre lista aplanada (rutas +
  resultados en orden determinista).
- `keywords` por ruta ("pos caja cobrar venta", "cxc cobranza cartera"…); el filtro
  compara nombre **o** keywords.
- Búsqueda de **pedidos y cotizaciones por número** vía REST
  (`where[orderNumber][like]`) → navega al detalle `orders/[id]` / `quotes/[id]`.
- **Filtrado por rol:** extraer la configuración de navegación del sidebar a un
  `navConfig.ts` compartido que consuman el sidebar y la paleta de la misma fuente
  (el shell ya recibe `userRole` — `app-shell.tsx:24`). El sidebar no debe cambiar ni
  un pixel.

**Migración:** no. **Riesgo:** medio-bajo (la única pieza delicada es extraer
`navConfig` sin alterar el sidebar).

**Notas de implementación (2026-09-10):**
1. El "navConfig compartido" **ya existía**: `src/components/app-shared.tsx` concentra
   `NAV_ITEMS` + `NAV_GROUPS` + `ROLE_NAV` + `buildNavGroups` (App Shell 4). No se
   extrajo nada — la paleta consumió la MISMA fuente vía nuevo helper
   `getPaletteRoutes(tenantSlug, userRole)`. El sidebar quedó byte-idéntico; de paso
   la paleta ahora muestra TODAS las rutas (le faltaban compras y reportes).
2. `keywords` se añadió como campo opcional de `NAV_ITEMS` (sinónimos en español por
   ruta: "pos punto de venta mostrador cobrar", "cxc cobranza cartera aging"…). El
   filtro compara título **o** keywords.
3. Lista APLANADA determinista: rutas → pedidos → cotizaciones → clientes →
   productos; un único índice activo con ↑↓/Enter (envolvente), hover sincroniza,
   `scrollIntoView` mantiene visible la opción activa; secciones con encabezados.
4. Pedidos por número vía REST (`where[orderNumber][like]`) → `orders/[id]`.
   **Cotizaciones**: no existe página `quotes/[id]` (sólo lista + quick) — el
   resultado por `quoteNumber` lleva a la lista de cotizaciones; una página de
   detalle de cotización sería un item futuro pequeño.
5. Lección React: el `useEffect` de `scrollIntoView` vive ANTES del early-return
   `if (!open)` — los hooks no pueden quedar tras un retorno condicional
   (regla `react-hooks/rules-of-hooks`).

### Item 25 — Email de alertas críticas (+ alerta de cuota vencida)

**Estado verificado:** `evaluateAlerts` (cron cada 15 min, queue `alerts`) evalúa 5
tipos con idempotencia estructural (índice único tenant+type+refId,
`alertsEvaluator.ts`); Resend ya está como email adapter de Payload; el usuario aún no
verifica su dominio en Resend.

**Diseño (patrones oficiales: `jobs.queue` + `sendEmail` en TaskConfig):**
- **Nueva alerta `overdue_installment`**: sección 6 en `alertsEvaluator` — para
  facturas issued/partially_paid con cuotas, la cuota no pagada más antigua vencida
  genera la alerta (refId = id de factura, mensaje con número de cuota y días). El
  `select` de `alerts` se amplía (varchar en Postgres — sin riesgo de enum).
- **Esquema:** campo `notifiedAt` (date, readOnly) en alerts; en Tenants
  `emailConfig.alertsEmailEnabled` (checkbox, **default false**) +
  `emailConfig.alertsEmailRecipients` (lista de emails, con fallback a los emails de
  los tenant-admin del inquilino).
- **Task `notifyAlertsEmail`** (TaskConfig, retries 2, misma queue `alerts`): input
  `{ tenantId }`; carga alertas activas con `notifiedAt null` y severidad
  warning/critical, arma un digest (mensajes + link al centro de alertas), lo envía con
  `req.payload.sendEmail` y estampa `notifiedAt` por alerta — los retries del job solo
  reprocesan las no enviadas (idempotente).
- **Disparo:** al final de `evaluateAlertsTask`, `req.payload.jobs.queue({ task:
  'notifyAlertsEmail', input })` por inquilino con alertas nuevas. Anti-spam
  estructural: 1 digest por ciclo, solo por alertas nuevas; una condición reactivada
  avisa una sola vez.
- Se enciende por inquilino en Ajustes — OFF por defecto hasta verificar el dominio
  Resend. La infraestructura es la misma queue que hoy ejecuta las alertas; el email no
  exige nada nuevo.

**Migración:** sí — `alerts.notifiedAt` + 2 campos en `emailConfig` (quirúrgica,
idempotente). **Riesgo:** bajo (el evaluador actual no se toca salvo añadir la sección y
el queue final).

### Item 6 — Crédito: enforcement del límite + UI del plan de cuotas

**Estado verificado:** `creditAllowed`/`creditLimitUSD`/`creditDays` existen en
Customers (`Customers/index.ts:295–308`) y se persisten desde las actions, pero
**nada los valida** en `createInvoiceCore`. La UI del detalle de factura muestra
`dueDate` pero no el plan de cuotas.

**Diseño:**
- **`src/utilities/credit.ts`** — función pura `evaluateCreditSale({
  creditAllowed, creditLimitUSD, currentDebtUSD, totalUSD })` → `{ ok } | { reason }`
  (estilo `tax.ts`: testeable en CI sin BD). Reglas:
  - `creditAllowed === false` → rechaza.
  - `creditLimitUSD > 0 && currentDebtUSD + totalUSD > creditLimitUSD` → rechaza con
    mensaje accionable.
  - `creditLimitUSD === 0` → sin tope (solo gobierna `creditAllowed`).
- **`createInvoiceCore`** la invoca **antes de cualquier escritura** (puro throw —
  contenido, sin tocar el flujo transaccional posterior). En el PR de Aprobaciones este
  mismo punto se convierte en la puerta de aprobación.
- **UI del plan de cuotas:** sección "Plan de Cuotas" en `invoices/[id]/page.tsx`
  (tabla nro/vencimiento/monto/pagado/estado con Badge) cuando
  `installments.length > 0`; select de cuotas (1–12) en el modal de factura a crédito.

**Migración:** no (todos los campos existen). **Riesgo:** contenido — enforcement es
lectura + throw previo a escrituras; función pura con test unitario para CI.

### Item 1 — Aprobaciones con firma

**Estado verificado:** no existe nada equivalente. El RBAC es el único freno hoy: un
usuario con rol puede vender a crédito sin tope real. Patrón de referencia de la casa:
`alerts` (`refCollection`/`refId` + índice único) y `erpAuth.allowedRoles`.

**Diseño:**
- **Colección `Approvals`** (`src/collections/Approvals/index.ts`): `tenant` (índice),
  `type` (select — **v1: solo `credit_over_limit`**), `status` (pending → approved →
  consumed | rejected | expired), `requestedBy`/`resolvedBy` → users, `decisionNote`,
  `refCollection`/`refId`, `payload` json con **el input parseado completo de la venta**
  (para re-ejecutarla), `expiresAt` (+24 h). Accesos: lectura tenant-scoped;
  create/update solo vía server actions con RBAC.
- **`src/utilities/approvals.ts`**: `requestApproval(...)` y `consumeApproval(id, req)`.
  Single-use atómico: advisory lock `hashtext('approval:{id}')` + relectura de status
  (mismo patrón que `nextDocumentNumber`). Solo `approved` y no expirada es
  consumible; `consumed` se estampa en la MISMA transacción de la venta.
- **Flujo con auto-ejecución (decisión recomendada):**
  1. `createInvoiceCore` en el punto del límite de crédito: si
     `req.context.approvalId` está presente → `consumeApproval` y continúa.
  2. Si no → crea la approval (payload = input parseado completo) y devuelve
     `{ status: 'pending_approval', approvalId }`. El POS/modal muestra "Solicitud
     enviada" con link.
  3. `approveApprovalAction` (roles tenant-admin/supervisor, verificados con
     `overrideAccess: false`): marca approved y **re-ejecuta la venta** con el input
     guardado + `approvalId` en `req.context`. Si el stock cambió entre solicitud y
     aprobación, `createInvoiceCore` re-valida todo naturalmente y la approval queda
     disponible para reintento (solo se consume con éxito). Sin doble-ejecución
     posible: consumo transaccional.
  4. `rejectApprovalAction` con nota obligatoria.
- **UI:** página `/erp/approvals` (pendientes + aprobar/rechazar), item en el sidebar
  (Administración) con badge de pendientes.

**Migración:** sí (tabla nueva + índices tenant+status). **Riesgo:** medio — por eso va
después del enforcement de crédito y limitado a un solo tipo. El camino de venta sin
aprobación no cambia en absoluto (el check solo se activa cuando el límite se excede).

### Item 7 — Wizard de importación (dry-run + mapeo de columnas)

**Estado verificado:** `inventoryImport.ts` ya consolida por SKU, ordena locks
(`lockStockBalances` antes de row locks), rechaza stock negativo por fila y crea todo
en la transacción del llamador. Pero `InventoryImportView` parsea y **commitea directo,
sin previsualización** — un CSV con errores se ejecuta y solo después se ven los fallos.

**Diseño:**
- **Refactor seguro:** extraer el planeador `planStockImport(...)` — toda la
  validación/agregación **sin crear movimientos** (devuelve plan por fila: ok/error con
  razón, y los movimientos que se crearían). `importStockToWarehouse` lo consume para
  el commit, quedando su comportamiento **byte-idéntico**. Test unitario del planeador
  para CI (la lógica de agregación y rechazo es pura).
- **`previewStockImportAction`** (nueva, read-only) + `importStockAction` (commit, sin
  cambios de contrato).
- **Wizard en `InventoryImportView`** (máquina de estados tipo tablist):
  1. **Archivo** — upload + parse actual (`parseCsv` client-side, se conserva).
  2. **Mapeo de columnas** — detección de headers con alias editables
     (`codigo/code/sku`, `cantidad/qty/stock`…) + modo (adjust/set) + almacén.
  3. **Dry-run** — llama preview; tabla por fila con ok/error y razones; resumen de
     movimientos propuestos.
  4. **Confirmar** — commit con las mismas filas.
  5. **Resultado** — la UI actual de resumen.
- `payload.db.beginTransaction` queda documentado como respaldo oficial para bulk
  fuera de request; la vía principal sigue siendo propagar `req` (invariante de la
  casa).

**Migración:** no. **Riesgo:** el más alto del lote (refactor de la ruta de carga
masiva) — por eso va último y el commit conserva el camino exacto de hoy.

**Alcance v1:** solo import de **stock**. El alta de catálogo desde CSV (equivalente
del killer-feature de Cendaro: matching fuzzy de categorías con `pg_trgm`, creación de
productos draft) queda como **Phase B** en un PR separado de tamaño doble, sujeto a
decisión del usuario.

---

## 3. Orden de ejecución y dependencias

| # | PR | Items | Migración | Riesgo |
|---|----|----|----|----|
| 1 | Pulido UI (skeletons + empty states) | 14, 15 | No | Nulo |
| 2 | POS keyboard-first | 18 | No | Bajo |
| 3 | Command palette | 17 | No | Medio-bajo |
| 4 | Email de alertas + cuota vencida | 25 + 6 parcial | Sí | Bajo |
| 5 | Enforcement de crédito + UI cuotas | 6 | No | Contenido |
| 6 | Aprobaciones | 1 | Sí | Medio |
| 7 | Wizard de importación | 7 | No | Medio-alto |

**Dependencias reales respetadas:**
- El email de cuotas vencidas (PR 4) necesita que la alerta `overdue_installment`
  exista — van juntos.
- Las aprobaciones (PR 6) se enchufan exactamente en el punto de enforcement que crea
  el PR 5 — por eso el orden.
- El wizard (PR 7) es el refactor más delicado y va último sobre una base estable.

**Protocolo por PR** (AGENTS.md §5.2): implementar → `tsc --noEmit` + `eslint` +
`next build` en verde → **1 push** → abrir PR → entregar link → terminar el turno. Los
tests corren exclusivamente en CI. Migraciones quirúrgicas e idempotentes (`IF NOT
EXISTS` / `DO $$ … duplicate_object`), nunca el diff crudo de drizzle.

---

## 4. Decisiones abiertas (el usuario decide antes de cada PR)

1. **Wizard v1** — solo stock (recomendado) vs. incluir alta de catálogo desde CSV
   (Phase B aparte).
2. **Aprobaciones v1** — solo crédito sobre límite (recomendado) vs. incluir también
   ajustes manuales de inventario.
3. **Aprobación** — auto-ejecutar la venta al aprobar (recomendado) vs. solo marcar
   aprobada para reintento manual del vendedor.

## 5. Items deliberadamente NO copiados de Cendaro

Para dejar constancia del criterio (detalle completo en el debate previo):

- **`doublePrecision` para dinero** — debilidad documentada de Cendaro; aquí Postgres
  numeric.
- **Política append-only de tasas** — el snapshot de tasa por documento ya protege el
  pasado; la tasa manual es legítima en Venezuela.
- **Updates optimistas con rollback** — el modelo server-action + refresh es más
  simple y honesto.
- **Tabla virtualizada** — la paginación server-side elimina el problema.
- **Stock por canal, Mercado Libre, IA de packing lists** — diferidos hasta que un
  cliente real los exija (Cendaro mismo los tiene parcialmente sin terminar).
- **tRPC + hidratación TanStack** — la Local API en RSC da lo mismo con menos piezas.

## 6. Verificación de hechos (referencias de código)

| Hecho | Referencia |
|---|---|
| auditPlugin con diff old→new | `src/plugins/audit.ts:182–256` |
| Hook de conciliación de cuotas | `src/collections/Invoices/index.ts:183–221` |
| Campo `installments` (array con dueDate) | `src/collections/Invoices/index.ts:452` |
| Campos de crédito en cliente | `src/collections/Customers/index.ts:295–308` |
| `installmentsCount` 1–12 en schema | `src/utilities/erpValidation.ts:78` |
| Numerador con advisory lock | `src/actions/erpActions.ts:540–592` |
| Evaluador de alertas (5 tipos, idempotente) | `src/utilities/alertsEvaluator.ts` |
| Job cron de alertas (15 min, queue `alerts`) | `src/jobs/evaluateAlerts.ts` |
| POS sin escáner/atajos/vuelto | `src/components/erp/POSView.tsx` |
| Palette sin teclado/roles | `src/components/erp/CommandPalette.tsx` |
| Import commitea sin dry-run | `src/components/erp/InventoryImportView.tsx:136` |
| `barcode` en Products (indexado) | `src/collections/Products/index.ts:230` |
| `userRole` disponible en el shell | `src/components/app-shell.tsx:24` |
| Allocation FIFO de cobros existente | `src/utilities/financeLedger.ts` |
