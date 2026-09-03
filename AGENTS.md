# AGENTS.md — Constitución de Ingeniería y Directivas de Arquitectura
## Empresarial SaaS (Payload CMS 3.x · Next.js 15 · Supabase)

> Este archivo define las directivas no-negociables para cualquier agente o desarrollador que trabaje en este repositorio.

---

## 1. Estándar Operativo No Negociable (Rigor Nivel Opus/Sonnet)
- **Pensar antes de actuar:** Analizar contratos de datos, dependencias cruzadas y radio de impacto antes de modificar cualquier archivo.
- **Cero código destructivo:** Prohibido borrar comentarios explicativos, eliminar utilidades no referenciadas o insertar atajos tipo `// rest remains the same`.
- **TypeScript Estricto:** Prohibido eludir el tipado con `any`, `unknown` forzados o `@ts-ignore` sin justificación técnica crítica documentada.

---

## 2. Invariante 100% Nativo del Framework (Cero Workarounds / Cero Hacks)
- **Ecosistema Oficial Primero:** Antes de programar utilidades custom, verificar siempre si existe un adaptador, plugin o patrón oficial en `@payloadcms/plugin-*`, la skill local de Payload o Context7 (`/payloadcms/payload`).
- **Arquitectura Canónica de Plugins:**
  Todo módulo o extensión de Payload debe seguir el patrón oficial de doble flecha (currying):
  ```ts
  export const myPlugin = (options: PluginOptions): Plugin => (incomingConfig: Config): Config => {
    return {
      ...incomingConfig,
      collections: [...(incomingConfig.collections || []), ...newCollections],
    }
  }
  ```
- **Preservación de Hooks en Plugins:** Nunca sobrescribir el array de hooks de una colección existente; componerlo:
  `hooks: { afterChange: [myHook, ...(collection.hooks?.afterChange || [])] }`.
- **Prevención de Bucles de Recursión en Hooks:**
  Usar siempre `req.context` para marcar operaciones internas y evitar loops infinitos:
  ```ts
  if (req.context.skipRecalculation) return doc;
  await req.payload.update({
    collection: 'customers',
    id: customerId,
    data: { currentDebtUSD: newBalance },
    req,
    context: { ...req.context, skipRecalculation: true },
  });
  ```
- **Propagación Transaccional:**
  En hooks de colección (`beforeChange`, `afterChange`, `beforeDelete`), pasar SIEMPRE `req` a las operaciones de Local API (`payload.find`, `payload.update`) para que participen en la misma transacción atómica de base de datos.

---

## 3. Invariantes de Infraestructura (Supabase & Vercel Serverless)
- **Runtime en Serverless:** Conexión a Supabase mediante Transaction Pooler (puerto **6543** con modo transacción) y `pool: { max: 10 }`.
- **Migraciones DDL:** Las migraciones de esquema (`ALTER TABLE`, `CREATE INDEX`) se ejecutan SIEMPRE por conexión directa (puerto **5432**) o mediante el SQL Editor de Supabase, NUNCA a través del Transaction Pooler 6543.
- **Aislamiento Multi-Tenant Oficial:**
  - Gobernado por `@payloadcms/plugin-multi-tenant`.
  - Aislamiento a nivel de fila (Row-Level Isolation) con campo foráneo `tenant` indexado.
  - Blindar el array `tenants` del usuario en el token JWT para prevenir escalada horizontal de privilegios.
- **Tareas Asíncronas en Serverless:**
  - Tareas pesadas (sincronización externa, emails, importaciones masivas) deben encolarse en el Payload Jobs Queue o ejecutarse dentro de `after(() => ...)` de Next.js.

---

## 4. Invariantes de Frontend y Rutas (Next.js 15+)
- `params` y `searchParams` en Server Components y Route Handlers son Promesas asíncronas:
  `const { tenant } = await params;`.
- La UI operativa consume la **Payload Local API** (`const payload = await getPayload({ config })`) dentro de React Server Components con cero latencia de red.
- En Client Components, consumir Server Actions o endpoints REST seguros de Payload.
