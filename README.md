# Empresarial SaaS · Cendaro ERP
> **Payload CMS 3.x · Next.js 15 App Router · Supabase PostgreSQL · Multi-Tenant Isolation · Vercel Serverless**

---

## 🏛️ Visión y Arquitectura

**Empresarial SaaS** es una plataforma ERP modular bimonetaria (USD / VES) construida sobre las capacidades nativas de **Payload CMS 3.x** y **Next.js 15**, diseñada para escalar en infraestructuras modernas serverless (**Vercel**) con bases de datos relacionales administradas (**Supabase PostgreSQL**).

### Principios Arquitectónicos
1. **100% Framework-Native (Cero Hacks):** Todo el sistema se apoya estrictamente en los adaptadores, plugins y patrones oficiales de Payload CMS (`@payloadcms/db-postgres`, `@payloadcms/plugin-multi-tenant`, `@payloadcms/richtext-lexical`).
2. **Aislamiento Multi-Inquilino Estricto:** Cada inquilino (`Tenant`) tiene aislamiento a nivel de fila (Row-Level Isolation) administrado por `@payloadcms/plugin-multi-tenant`. Las credenciales y el array de tenants están blindados en el JWT para impedir escalada horizontal de privilegios.
3. **Persistencia & Transaction Pooler (Supabase):**
   - **Runtime Serverless:** Conexión a través del Supabase Transaction Pooler (puerto `6543`) con `pool: { max: 10 }` y `pgbouncer=true`.
   - **Migraciones DDL:** Las migraciones de esquema se aplican exclusivamente mediante conexión directa (puerto `5432`) o scripts de CI/CD.
4. **Transaccionalidad Atómica en Hooks:** Todas las mutaciones cruzadas (recalculación de balances, deducción de inventario por producción) pasan el objeto `req` para ejecutarse en la misma transacción de PostgreSQL, con banderas en `req.context` para prevenir bucles de recursión.
5. **Desarrollo Guiado por Sprints & PRs:** Cada módulo funcional se implementa de manera incremental con sus propias migraciones, esquemas y pruebas, validando el despliegue en Vercel antes de avanzar al siguiente.

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología | Versión | Propósito |
| :--- | :--- | :--- | :--- |
| **Framework Web** | Next.js (App Router) | `15.x` | Server Components, Server Actions y Route Handlers con streaming |
| **Headless CMS & Core**| Payload CMS | `3.x` | Modelado de datos, admin panel interactivo, Local API con cero latencia |
| **Base de Datos** | PostgreSQL (Supabase) | `15+` | Persistencia relacional con Transaction Pooler (puerto 6543) |
| **Multi-Tenancy** | `@payloadcms/plugin-multi-tenant`| `3.x` | Aislamiento por inquilino y asignación contextual |
| **Hosting & Edge** | Vercel Serverless | - | Edge CDN, Node.js 22 serverless functions y CI/CD |
| **Estilos & UI** | Tailwind CSS + Lucide | `3.4+` | App Shell operativa de alta densidad (Cendaro UI) |
| **TypeScript** | TypeScript | `5.9+` | Modo estricto sin `any` ni bypasses de tipos |

---

## 📁 Estructura del Repositorio

```txt
empresarial-saas/
├── .agents/                    # Skills locales de ingeniería y Payload 3.x
├── .claude/                    # Directivas de contexto para modelos Anthropic
├── src/
│   ├── app/
│   │   ├── (app)/              # Rutas de la UI Operativa (Cendaro ERP)
│   │   │   ├── [tenant]/erp/   # Cockpit ERP aislado por tenant
│   │   │   ├── layout.tsx      # Root layout frontend
│   │   │   └── page.tsx        # Landing / selector de inquilino
│   │   └── (payload)/          # Rutas del Panel Administrativo de Payload
│   │       ├── admin/          # Admin UI (Next.js App Router views)
│   │       ├── api/[...slug]/  # Handlers REST canónicos de Payload
│   │       └── layout.tsx      # RootLayout con importMap y serverFunctions
│   ├── collections/            # Colecciones canónicas del Core
│   │   ├── Users.ts            # Usuarios, roles ('super-admin', 'tenant-admin', etc.)
│   │   ├── Tenants.ts          # Inquilinos / Empresas registradas
│   │   └── Media.ts            # Archivos adjuntos y comprobantes
│   ├── migrations/             # Migraciones DDL versionadas de Payload Postgres
│   ├── plugins/
│   │   └── erp/                # Plugin modular canónico Cendaro ERP
│   │       ├── collections/    # Colecciones de negocio (Customers, Invoices, BOM, etc.)
│   │       ├── hooks/          # Hooks transaccionales de ledger y stock
│   │       ├── templates/      # Motor de plantillas por industria
│   │       └── types.ts        # Contratos de tipos del plugin
│   ├── components/             # Componentes compartidos de interfaz
│   ├── lib/                    # Utilidades y servicios (Tasas BCV, Zod schemas)
│   ├── payload.config.ts       # Configuración central de Payload CMS 3.x
│   └── payload-types.ts        # Tipos generados automáticamente por Payload
├── .env.example                # Plantilla de variables de entorno
├── AGENTS.md                   # Constitución de ingeniería y reglas operativas
├── ROADMAP.md                  # Hoja de ruta exhaustiva y estado de sprints
├── package.json
├── tsconfig.json
└── next.config.ts
```

---

## ⚙️ Configuración del Entorno Local

### 1. Prerrequisitos
- **Node.js**: `v20.x` o `v22.x` (LTS recomendado).
- **pnpm**: `v10.x` o `v9.x`.
- **Cuenta en Supabase**: Proyecto creado con PostgreSQL.
- **Cuenta en Vercel**: Para despliegues en producción y preview.

### 2. Variables de Entorno (`.env`)
Copia `.env.example` a `.env` y configura los valores de tu base de datos Supabase:

```bash
cp .env.example .env
```

Configura los siguientes valores esenciales:

```env
# 1. Supabase PostgreSQL - Transaction Pooler (Puerto 6543)
DATABASE_URI="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"

# 2. Conexión Directa para Migraciones DDL (Puerto 5432)
DATABASE_DIRECT_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"

# 3. Payload Secret (Llave aleatoria de al menos 32 caracteres)
PAYLOAD_SECRET="tu-clave-secreta-de-payload-super-segura-32-chars-min"

# 4. URL Pública de la Aplicación
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
```

### 3. Instalación de Dependencias
```bash
pnpm install
```

### 4. Ciclo de Vida de Base de Datos & Migraciones
Payload 3.x utiliza `@payloadcms/db-postgres` con `push: false` para control estricto de esquema en producción:

```bash
# Crear una nueva migración a partir de los cambios en collections
pnpm payload migrate:create nombre_de_migracion

# Aplicar migraciones pendientes
pnpm payload migrate

# Comprobar el estado de las migraciones
pnpm payload migrate:status
```

### 5. Servidor de Desarrollo
```bash
pnpm dev
```
* **Panel de Administración**: [http://localhost:3000/admin](http://localhost:3000/admin)
* **API REST**: [http://localhost:3000/api](http://localhost:3000/api)
* **Cockpit Operativo**: `http://localhost:3000/[tenant-slug]/erp`

---

## 🚀 Despliegue en Vercel

1. **Vincular el proyecto a Vercel**:
   ```bash
   vercel link
   ```
2. **Cargar variables de entorno en Vercel**:
   - Agrega `DATABASE_URI` (puerto 6543 con `pgbouncer=true`).
   - Agrega `DATABASE_DIRECT_URL` (puerto 5432).
   - Agrega `PAYLOAD_SECRET`.
   - Agrega `NEXT_PUBLIC_SITE_URL` (URL del dominio de producción).
3. **Build & Verificación**:
   El comando de build ejecutará la generación de types, importMap y el build de Next.js 15:
   ```bash
   pnpm build
   ```

---

## 🔄 Flujo de Trabajo por Sprints y PRs

Para evitar regresiones y asegurar que el código en `main` sea 100% funcional y desplegable:

1. **Una rama por Sprint:** `feat/sprint-X-nombre-del-modulo`.
2. **Criterios de Merge (Checklist Obligatorio):**
   - [ ] `pnpm typecheck` o `tsc --noEmit` sin errores de TypeScript.
   - [ ] `pnpm build` completa con éxito localmente.
   - [ ] Migración DDL generada y registrada en `src/migrations`.
   - [ ] Verificación en `/admin` de las colecciones involucradas.
   - [ ] Despliegue Preview en Vercel verificado en verde.
3. **Merge a `main`:** Pull Request formal tras pasar la batería de comprobaciones.

Consulta [ROADMAP.md](ROADMAP.md) para el detalle de objetivos y entregables de cada sprint.
