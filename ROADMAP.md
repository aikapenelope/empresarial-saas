# ROADMAP.md — Hoja de Ruta Detallada de Ingeniería
## Empresarial SaaS (Payload CMS 3.x · Next.js 15 · Supabase)

> Este roadmap define las fases de desarrollo, contratos de datos, dependencias técnicas y estándares canónicos basados en la skill oficial de Payload CMS 3.x, las mejores prácticas de Context7 y la arquitectura consolidada de Cendaro, Supasheet y Storelink.

---

## 🧭 Visión del Producto
Transformar las capacidades probadas de **Cendaro ERP** en una suite de plugins nativos de **Payload CMS 3.x** (`payloadPluginERP`), montado sobre **Next.js 15 App Router** y respaldado por el Transaction Pooler de **Supabase PostgreSQL** con aislamiento multi-inquilino de fila (`@payloadcms/plugin-multi-tenant`).

---

## 📦 Fases de Implementación

### Fase 0: Cimientos de Infraestructura & Plugin Skeleton
- [ ] Inicializar proyecto Next.js 15 con App Router y TypeScript estricto.
- [ ] Configurar `@payloadcms/db-postgres` con el Transaction Pooler de Supabase (puerto 6543, `pool: { max: 10 }`, TLS según CA cert).
- [ ] Configurar `@payloadcms/plugin-multi-tenant` sobre colecciones base (`Users`, `Tenants`, `Media`).
- [ ] Estructurar el paquete de plugin `src/plugins/erp/` con la signatura canónica:
  `(options: ERPPluginConfig): Plugin => (config: Config): Config => { ... }`.
- [ ] Configurar Payload Jobs Queue para operaciones en segundo plano con soporte serverless (`after()`).

---

### Fase 1: Módulo 1 — Finance & Customer CRM Core (🎯 Sprint Actual)
> **Objetivo:** Implementar la infraestructura de Cuentas por Cobrar (CxC), Facturación Multi-moneda Bimonetaria (USD/Bs) y CRM Ligero de Clientes con cálculo inmutable de saldo y cobranza por WhatsApp.

- [x] **Colección `Customers` (Enriquecida con CRM y Crédito):**
  - Identificación fiscal (`rifCi`), Razón social / Nombre, Teléfono formateado internacional para WhatsApp, Email, Dirección.
  - Clasificación CRM de ciclo de vida (`lifecycleStage`: `'lead' | 'first_time' | 'recurring' | 'vip' | 'inactive'`).
  - Términos de Crédito: `creditAllowed: boolean`, `creditLimitUSD: number`, `creditDays: number`.
  - Campos de Balance (Mantenidos por Ledger Hooks):
    - `currentDebtUSD`: Total adeudado en USD.
    - `currentDebtVES`: Total adeudado equivalente en moneda local.
    - `overdueDebtUSD`: Deuda vencida fuera del plazo pactado.
  - Campos Virtuales de Antigüedad (Aging Analysis via `afterRead` field hooks):
    - `aging0to30`: Cartera corriente (0 a 30 días).
    - `aging31to60`: Cartera en mora temprana (31 a 60 días).
    - `aging60Plus`: Cartera en mora crítica (+60 días).
  - Notas de seguimiento comercial y URL de chat directo de WhatsApp (`https://wa.me/...`).

- [x] **Colección `Invoices` (Facturas y Notas de Entrega Bimonetarias):**
  - Número correlativo de factura / control.
  - Relación a `Customers` y relación opcional a `Orders`.
  - Tipo de condición: `'cash' | 'credit'`.
  - Fecha de emisión y fecha de vencimiento (`dueDate`).
  - Snapshot cambiario: `exchangeRateSnapshot` (tasa fijada al momento exacto de emisión).
  - Totales bimonetarios: `totalUSD`, `totalVES`, `balanceUSD` (saldo pendiente).
  - Estado: `'draft' | 'pending' | 'partially_paid' | 'paid' | 'cancelled'`.
  - Array de items facturados con SKU, descripción, cantidad, precio unitario y subtotal.

- [x] **Colección `CustomerPayments` (Abonos y Cobranzas):**
  - Relación a `Customers`.
  - Monto pagado: `amountUSD`, `amountVES`, tasa de cambio aplicada.
  - Método de pago: `'cash_usd' | 'cash_ves' | 'zelle' | 'pago_movil' | 'transfer_ves' | 'binance'`.
  - Referencia bancaria / recibo de pago y comprobante adjunto (`Media`).
  - Desglose de asignación (`allocations`):
    - Relación a `Invoices`.
    - `allocatedAmountUSD`: Monto aplicado específicamente a cada factura.

- [x] **Hooks de Ledger Transaccional & Integridad de Balances:**
  - Hook `afterChange` en `Invoices` y `CustomerPayments` que recalcula de forma atómica y consistente el balance del cliente en `Customers`.
  - Prevención de recursión con `req.context.skipBalanceRecalculation`.
  - Propagación de transacciones pasando `{ req }` a cada llamada interna de la Local API.
  - Reversión atómica en hooks `beforeDelete` para mantener la simetría del ledger ante anulaciones.

- [x] **Acción y Generación de Cobranza por WhatsApp:**
  - Endpoint o Server Action `/api/customers/:id/statement`: Genera el estado de cuenta consolidado con desglose de facturas pendientes.
  - Generador de mensaje preformateado para WhatsApp con saldo total, facturas vencidas y datos de cuentas bancarias/pago móvil del tenant.

---

### Fase 2: Módulo 2 — BOM (Bill of Materials) & Producción
- [x] **Colección `BillOfMaterials` (Fórmulas de Fabricación):**
  - Relación a producto terminado (`Products` con `productType = 'manufactured'`).
  - Rendimiento base (`yieldQuantity`) y unidad de medida.
  - Lista de componentes e insumos (`rawMaterial`, cantidad requerida, unidad, porcentaje de merma).
  - Costo de mano de obra y costos indirectos de fabricación (CIF).
- [x] **Colección `ProductionOrders` (Órdenes de Fabricación):**
  - Folio correlativo (`OP-0001`).
  - Relación a `BillOfMaterials`.
  - Cantidad a fabricar y fechas programadas.
  - Estados: `'draft' | 'planned' | 'in_progress' | 'completed' | 'cancelled'`.
- [x] **Hooks Transaccionales de Consumo y Costeo:**
  - Al completar orden: descuento automático de stock de materias primas vía `StockMovements`.
  - Entrada de producto terminado al inventario.
  - Cálculo del Costo Unitario Real basado en ingredientes consumidos y actualización del costo ponderado.

---

### Fase 3: Módulo 3 — Cuentas por Pagar (CxP) & Proveedores
- [x] **Colección `Suppliers`:** Registro de proveedores, RIF/taxId, crédito comercial y deuda acumulada.
- [x] **Colección `PurchaseInvoices`:** Facturas de compras a proveedores con vencimiento y saldo pendiente.
- [x] **Colección `SupplierPayments`:** Comprobantes de egreso y abonos a facturas de proveedores.
- [x] Hooks de conciliación automática de saldo deudor con proveedores.

---

### Fase 4: Módulo 4 — Cierre de Caja & POS
- [x] **Colección `CashRegisters`:** Cajas registradoras / puntos de venta físicos por sucursal.
- [x] **Colección `CashClosures`:** Sesiones de turno con registro de apertura, conteo ciego de cierre, desglose multimétodo y cálculo de sobrante/faltante.
- [x] Servicio de consulta de tasas automáticas (BCV / Binance P2P) con cache serverless (120s) e invalidación bajo demanda.

---

### Fase 5: Módulo 5 — Frontend Operativo Dedicado (UI Cendaro)
- [ ] Montar ruta en Next.js 15: `src/app/(app)/[tenant]/erp/`.
- [ ] Adaptar App Shell, Sidebar colapsable y navegación modular de Cendaro.
- [ ] Data Grids virtuales con `@tanstack/react-table` y `@tanstack/react-virtual` para catálogos masivos.
- [ ] Vistas operativas: Dashboard financiero, POS rápido, Cartera y envejecimiento de deuda, Cierre de turno.

---

### Fase 6: Módulo 6 — Motor de Plantillas por Industria (Inspirado en Supasheet)
- [ ] Presets de datos de industria (`industry-presets.ts`): Alimentos/Panadería, Ferretería, Mayorista B2B, Moda.
- [ ] Wizard de onboarding que auto-puebla categorías, unidades de medida, métodos de pago y BOMs de ejemplo mediante Jobs Queue.

---

## 🔒 Estándares de Seguridad y Calidad
- 100% TypeScript sin `any` ni `unknown` sin validar.
- Control de acceso estricto por roles (`super-admin`, `tenant-admin`, `cajero`, `supervisor`).
- Validación con esquemas Zod en todas las entradas de mutación.
- Pruebas unitarias de cálculo financiero con Vitest.
