# Sprint 49 — Portal de Pedidos B2B (Vercel Commerce Style + Control Superadmin + Presupuestos ERP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar un portal de pedidos y catálogo web B2B de alto rendimiento inspirado en Vercel Next.js Commerce y ERPNext en `/[tenant]`, alimentado por la colección `Products` y `Media` de Payload CMS con compresión Sharp, activación exclusiva por Superadmin en `Tenants`, y generación directa de cotizaciones borradores en el ERP con enlace inmediato a WhatsApp.

**Architecture:** 
- **Esquema:** Añadir `isPublishedOnWeb` en `Products`, `imageSizes` con compresión WebP en `Media` con lectura pública, y `storefrontConfig` en `Tenants` con switch `enabled` blindado a nivel de campo con RBAC para `super-admin`.
- **Backend & Proyección:** Server Action pública `createStorefrontQuoteAction` que valida inputs con Zod, resuelve precios inmutables desde base de datos, auto-crea o asocia el cliente en `Customers`, genera la `Quote` en estado `draft`, emite el `shareToken` seguro y retorna la URL directa de WhatsApp (`wa.me`).
- **Frontend:** Server Component en `src/app/(app)/[tenant]/page.tsx` con UI monocromática estilo Vercel Commerce (Next.js 15, Lucide, Tailwind neutral), buscador instantáneo, filtrado por categorías, drawer de carrito (`StorefrontCartDrawer`), modal de datos de empresa y confirmación con un clic a WhatsApp.

**Tech Stack:** Next.js 15 App Router (RSC + Server Actions), Payload CMS 3.88+, Sharp (compresión WebP nativa), Supabase Postgres, Tailwind CSS, Shadcn/ui neutral.

---

## Global Constraints
- Framework-Native: Cero hacks, 100% APIs oficiales de Payload CMS 3.x y Next.js 15.
- Base de datos local: Puerto 54322 (`/tmp/pg-local`). PROHIBIDO tocar puerto 5432 o `/tmp/mh-pg`.
- Next.js 15: `params` asíncronos (`const { tenant } = await params`).
- Seguridad: Los precios en cotización siempre se consultan en el servidor (anti-tampering).

---

### Task 1: Configuración de Colecciones Payload (`Media`, `Products`, `Tenants`)

**Files:**
- Modify: `src/collections/Media.ts`
- Modify: `src/collections/Products/index.ts`
- Modify: `src/collections/Tenants.ts`

**Interfaces:**
- `Media`: Soporta compresión Sharp nativa a WebP (`card: 800x800`, `thumbnail: 400x400`, calidad 80). `access.read` público (`() => true`).
- `Products`: Campo booleano `isPublishedOnWeb` (default: `true`, index: `true`).
- `Tenants`: Grupo `storefrontConfig` con `enabled` (access update restringido a `super-admin`), `whatsappOrdersNumber`, `portalTitle`, `portalDescription`.

- [ ] **Step 1.1:** Actualizar `src/collections/Media.ts` con `imageSizes` y `access.read: () => true`.
- [ ] **Step 1.2:** Añadir `isPublishedOnWeb` en `src/collections/Products/index.ts`.
- [ ] **Step 1.3:** Añadir `storefrontConfig` en `src/collections/Tenants.ts` con control de acceso nativo para `super-admin`.
- [ ] **Step 1.4:** Regenerar tipos de TypeScript con `pnpm payload generate:types`.

---

### Task 2: Server Action de Pedido y Cotización B2B (`createStorefrontQuoteAction`)

**Files:**
- Create: `src/actions/storefrontActions.ts`
- Test: `tests/unit/storefrontQuote.test.ts`

**Interfaces:**
- Consumes: `getPayload`, `ensureShareToken`, `resolveEffectiveRate`, `nextDocumentNumber`.
- Produces: `createStorefrontQuoteAction(input: StorefrontQuoteInput): Promise<StorefrontQuoteResult>`.

- [ ] **Step 2.1:** Escribir prueba unitaria fallida (`tests/unit/storefrontQuote.test.ts`) verificando:
  - Rechazo si el tenant tiene la tienda apagada (`storefrontConfig.enabled === false`).
  - Precios calculados desde la BD del tenant (anti-tampering).
  - Auto-creación de cliente si no existe en el CRM.
  - Creación de cotización `draft` con `shareToken` y URL a WhatsApp.
- [ ] **Step 2.2:** Implementar `createStorefrontQuoteAction` en `src/actions/storefrontActions.ts`.
- [ ] **Step 2.3:** Ejecutar pruebas unitarias (`pnpm test:unit`) y verificar que pasen en verde.

---

### Task 3: Componentes de UI Storefront Monocromático (Estilo Vercel Commerce)

**Files:**
- Create: `src/components/storefront/StorefrontHeader.tsx`
- Create: `src/components/storefront/StorefrontProductCard.tsx`
- Create: `src/components/storefront/StorefrontCatalog.tsx`
- Create: `src/components/storefront/StorefrontCartDrawer.tsx`
- Create: `src/components/storefront/StorefrontCheckoutModal.tsx`
- Create: `src/components/storefront/types.ts`

**Interfaces:**
- `ProductProjection`: `{ id: number; name: string; sku: string; priceUSD: number; description?: string; categoryName?: string; inStock: boolean; imageUrl?: string; }`
- Componentes modulares, totalmente accesibles, tema oscuro minimalista con contraste neutro.

- [ ] **Step 3.1:** Crear `src/components/storefront/types.ts` con los tipos públicos proyectados.
- [ ] **Step 3.2:** Crear `StorefrontHeader.tsx` con logo/nombre de la empresa, indicador de tasa BCV y botón del carrito con badge reactivo.
- [ ] **Step 3.3:** Crear `StorefrontProductCard.tsx` con renderizado de imagen de Media (o fallback SVG), nombre, precio USD/VES y botón de agregar.
- [ ] **Step 3.4:** Crear `StorefrontCartDrawer.tsx` con lista de ítems, selector de cantidades y total estimado.
- [ ] **Step 3.5:** Crear `StorefrontCheckoutModal.tsx` para captura de datos comerciales (Razón Social, RIF, Teléfono, Notas) y pantalla de éxito con botón verde de WhatsApp.
- [ ] **Step 3.6:** Ensamblar `StorefrontCatalog.tsx` con buscador en vivo y filtros por categoría.

---

### Task 4: Ruta Pública de la Tienda en Next.js 15 App Router

**Files:**
- Create: `src/app/(app)/[tenant]/page.tsx`
- Create: `src/app/(app)/[tenant]/not-found.tsx`

- [ ] **Step 4.1:** Implementar `src/app/(app)/[tenant]/page.tsx`:
  - `params: Promise<{ tenant: string }>` con `const { tenant: tenantSlug } = await params`.
  - Consulta a Payload Local API buscando el tenant por slug.
  - Si no existe o `storefrontConfig.enabled !== true`, renderizar vista informativa de tienda no activa o `notFound()`.
  - Consultar productos activos con `isPublishedOnWeb: true` y `productType in ['standard', 'manufactured']`.
  - Cargar tasa oficial BCV del inquilino y pasar proyección segura al cliente.

---

### Task 5: Validación Integral y Protocolo de Cierre

- [ ] **Step 5.1:** Ejecutar `pnpm typecheck` para asegurar cero errores de TypeScript.
- [ ] **Step 5.2:** Ejecutar `pnpm lint` para garantizar limpieza de código.
- [ ] **Step 5.3:** Ejecutar suite completa de pruebas (`pnpm test:unit`).
- [ ] **Step 5.4:** Un solo push a la rama `feat/sprint49-storefront-b2b`, abrir el Pull Request y terminar el turno sin espera de builds.
