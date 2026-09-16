# Catálogo de Diagramas Interactivos · Cendaro ERP
> Generado con **Archify** (HTML interactivo auto-contenido, soporte de temas claro/oscuro, vistas semánticas y exportación SVG/PNG).

Todos los diagramas son interactivos y pueden abrirse directamente en cualquier navegador web moderno sin requerir un servidor o dependencias externas.

---

## 📁 Estructura del Directorio

```txt
docs/diagrams/
├── 01-architecture/            # Arquitectura global y topología de infraestructura
│   ├── system-architecture.html
│   └── system-architecture.architecture.json
├── 02-workflows/               # Flujos operativos y procesos de negocio
│   ├── commercial-sales-pipeline.html
│   ├── commercial-sales-pipeline.workflow.json
│   ├── pos-and-cash-closure.html
│   ├── pos-and-cash-closure.workflow.json
│   ├── manufacturing-bom.html
│   ├── manufacturing-bom.workflow.json
│   ├── storefront-b2b.html
│   ├── storefront-b2b.workflow.json
│   ├── treasury-macrodroid.html
│   └── treasury-macrodroid.workflow.json
├── 03-feature-tree/            # Árbol de opciones, navegación y mapa funcional
│   ├── erp-feature-tree.html
│   └── erp-feature-tree.architecture.json
└── 04-dataflow/                # Pipelines de datos, recálculos y libro mayor
    ├── bimonetary-ledger-pipeline.html
    └── bimonetary-ledger-pipeline.dataflow.json
```

---

## 1. Arquitectura del Sistema (`01-architecture/`)

- **Archivo principal:** [`system-architecture.html`](file:///Users/angelpenalver/orca/workspaces/empresarial-saas/main-2/docs/diagrams/01-architecture/system-architecture.html)
- **Tipo:** `architecture`
- **Descripción:** Muestra la arquitectura completa de Cendaro ERP orientada a micro-servicios serverless en Vercel y persistencia en Supabase PostgreSQL.
  - **Frontend & Edge:** Next.js 15 App Router con React Server Components (RSC) y Server Actions, detrás de Vercel Edge Network.
  - **Resiliencia & Error Boundaries (Sprint 46):** Jerarquía multi-nivel de captura de errores (`error.tsx`, `[tenant]/erp/error.tsx`, `global-error.tsx`) y endpoint de salud `/api/health` con modo degradado (503) ante desconexión de PostgreSQL.
  - **Seguridad & Aislamiento:** JWT blindado con contexto de inquilino (`Tenant`), validación estricta a nivel de fila (*Row-Level Isolation*).
  - **Core ERP & Módulos Nativos:** Payload CMS 3.x consumido vía Local API con cero latencia de red; módulos nativos (Storefront B2B `/t/[slug]`, RRHH, Tesorería) y plugins atómicos (`salesInventory`, `pricing`, `audit`).
  - **Persistencia:** Supabase PostgreSQL con conexión transaccional vía Transaction Pooler (puerto `6543`, PgBouncer) y conexión directa (puerto `5432`) para migraciones DDL.
  - **Tareas en Fondo & Media:** Cola de tareas de Payload (`Payload Job Queue` / `after()`) y almacenamiento de comprobantes en S3 Storage.

---

## 2. Flujos Operativos y Procesos de Negocio (`02-workflows/`)

### A. Pipeline Comercial y Facturación Bimonetaria
- **Archivo principal:** [`commercial-sales-pipeline.html`](file:///Users/angelpenalver/orca/workspaces/empresarial-saas/main-2/docs/diagrams/02-workflows/commercial-sales-pipeline.html)
- **Tipo:** `workflow` (Schema v2)
- **Descripción:** Cubre el ciclo comercial de punta a punta:
  1. **Cotización:** Emisión de `Quotes` con precios base en dólares.
  2. **Motor de Precios:** Evaluación de reglas de margen con `pricingPlugin`. Si el descuento excede el umbral, deriva a la compuerta de **Aprobación de Supervisión**.
  3. **Pedido de Venta:** Conversión formal a orden confirmada (`Orders`).
  4. **Despacho y Kardex:** Emisión de `DeliveryNotes` con rebaja física e inmediata en el Kardex.
  5. **Facturación y Cobro:** Emisión de factura fiscal y liquidación bimonetaria (`CustomerPayments`) con recálculo atómico de saldos (*locks FOR UPDATE*).

### B. Ciclo de Punto de Venta (POS) y Cierre de Caja
- **Archivo principal:** [`pos-and-cash-closure.html`](file:///Users/angelpenalver/orca/workspaces/empresarial-saas/main-2/docs/diagrams/02-workflows/pos-and-cash-closure.html)
- **Tipo:** `workflow` (Schema v2)
- **Descripción:** Modela la jornada completa en mostrador y cajas:
  1. **Apertura de Caja:** Declaración de fondo inicial en efectivo (USD / VES) en `CashRegisters`.
  2. **Venta Rápida POS:** Registro ágil por código de barras o búsqueda rápida.
  3. **Cobro Mixto:** Pago dividido (Efectivo divisas, Pago Móvil, Tarjeta) con tasa BCV congelada al instante.
  4. **Deducción de Stock:** Asiento automático de salida en Kardex.
  5. **Arqueo y Cierre:** Conteo ciego por cajero, detección de descuadres (sobrantes/faltantes) y asiento definitivo en `CashClosures`.

### C. Manufactura (BOM) y Transformación de Inventario
- **Archivo principal:** [`manufacturing-bom.html`](file:///Users/angelpenalver/orca/workspaces/empresarial-saas/main-2/docs/diagrams/02-workflows/manufacturing-bom.html)
- **Tipo:** `workflow` (Schema v2)
- **Descripción:** Proceso de producción y costeo industrial:
  1. **Receta BOM:** Definición de lista de materiales, mermas porcentuales y componentes.
  2. **Orden de Producción:** Emisión en `ProductionOrders` con verificación de déficit de stock.
  3. **Reserva y Planta:** Bloqueo de materia prima y pase a línea de ensamblaje/transformación.
  4. **Ingreso y Costeo:** Alta del lote de producto terminado en Kardex y liquidación del costo promedio ponderado.

### D. Storefront B2B y Generación de Pedidos
- **Archivo principal:** [`storefront-b2b.html`](file:///Users/angelpenalver/orca/workspaces/empresarial-saas/main-2/docs/diagrams/02-workflows/storefront-b2b.html)
- **Tipo:** `workflow` (Schema v2)
- **Descripción:** Ciclo de compra para clientes comerciales:
  1. **Catálogo Público:** Navegación por catálogo en `/t/[slug]` con filtrado de productos por inquilino.
  2. **Carrito B2B:** Precios en USD con contravalor en VES según tasa BCV vigente.
  3. **Checkout Rápido:** Captura de RIF y datos de contacto sin obligar al comprador a registrar contraseña.
  4. **Cotización Borrador:** Creación automática en `quotes` dentro del ERP del inquilino.
  5. **Notificación Directa:** Enlace a WhatsApp (`wa.me`) con link criptográfico `/share/quotes/[token]`.
  6. **Conversión Comercial:** El vendedor revisa la cotización y la aprueba para pase a pedido (`Orders`).

### E. Conciliación Bancaria y Webhook MacroDroid
- **Archivo principal:** [`treasury-macrodroid.html`](file:///Users/angelpenalver/orca/workspaces/empresarial-saas/main-2/docs/diagrams/02-workflows/treasury-macrodroid.html)
- **Tipo:** `workflow` (Schema v2)
- **Descripción:** Automatización de conciliación bancaria a costo cero para Venezuela:
  1. **Recepción SMS:** Notificación bancaria en dispositivo Android de la empresa (Banesco, Mercantil, BDV, etc.).
  2. **MacroDroid:** Extracción de datos con expresiones regulares (Referencia, Monto, Cédula, Banco).
  3. **Ingesta Criptográfica:** Envío mediante POST a `/api/webhooks/bank-sms` validando firma HMAC SHA256.
  4. **Cruce Automático:** Detección de coincidencia con facturas o recibos pendientes de pago.
  5. **Asiento Inmutable:** Creación del registro en `bank-movements` y liquidación del saldo con `FOR UPDATE`.
  6. **Alerta en Vivo:** Notificación visual al cajero en el POS o cockpit de ventas.

---

## 3. Árbol de Opciones y Mapa Funcional de Features (`03-feature-tree/`)

- **Archivo principal:** [`erp-feature-tree.html`](file:///Users/angelpenalver/orca/workspaces/empresarial-saas/main-2/docs/diagrams/03-feature-tree/erp-feature-tree.html)
- **Tipo:** `architecture`
- **Descripción:** Desglose jerárquico del sistema y de toda la barra de navegación de Cendaro ERP:
  - **Hub Raíz:** Cockpit multi-inquilino (`/[tenant]/erp`).
  - **Rama Ventas & Comercial:** Clientes (`customers`), Cotizaciones (`quotes`), Pedidos (`orders`), Notas de Entrega (`delivery-notes`), Facturación (`invoices`), Cuentas por Cobrar (`receivables`) y Storefront B2B (`/t/[slug]`).
  - **Rama Inventario & Almacén:** Productos (`products`), Categorías (`categories`), Almacenes (`warehouses`), Movimientos Kardex (`inventory/kardex`), Conteos Físicos (`inventory/counts`), Manufactura BOM (`BillOfMaterials`, `ProductionOrders`).
  - **Rama Finanzas & Bancos:** Punto de Venta (`pos`), Cajas Registradoras (`cash-registers`), Cuentas Bancarias (`bank-accounts`), Movimientos Bancarios (`bank-movements`), Tasas de Cambio (`rates`), Cobros y Pagos a Proveedores (`vendors`, `purchases`).
  - **Rama Fiscal & Reportes:** Libro de Ventas SENIAT en CSV (UTC-4 America/Caracas), Kardex Valorado (`reports/kardex`), Antigüedad de Deuda (`reports/aging`).
  - **Rama Gobernanza, RRHH & Configuración:** Gestión de empleados (`employees`), incidencias y asistencias (`employment-events`), aprobaciones pendientes (`approvals`), auditoría inmutable (`audit`), alertas automáticas (`alerts`), plantillas por industria (`templates`), configuración general (`settings`).

---

## 4. Pipeline de Datos y Ledger Bimonetario (`04-dataflow/`)

- **Archivo principal:** [`bimonetary-ledger-pipeline.html`](file:///Users/angelpenalver/orca/workspaces/empresarial-saas/main-2/docs/diagrams/04-dataflow/bimonetary-ledger-pipeline.html)
- **Tipo:** `dataflow`
- **Descripción:** Pipeline continuo que gobierna la economía dual (USD / VES) del ERP:
  - **Etapa Orígenes:** Tasa oficial publicada por el BCV y eventos de venta en mostrador/POS.
  - **Etapa Ingesta:** Tarea programada de sincronización de tasa y validación Zod de pedidos vía Server Actions.
  - **Etapa Cálculo:** Motor bimonetario (`pricingPlugin`) calculando precios en bolívares referenciales y discriminando bases imponibles, IVA e IGTF (3%).
  - **Etapa Libro Mayor:** Persistencia transaccional en PostgreSQL con bloqueo `FOR UPDATE` para garantizar consistencia atómica sin condiciones de carrera.
  - **Etapa Reportería:** Derivación hacia reportes de cartera vencida y generación del Libro de Ventas en formato oficial para el SENIAT.
