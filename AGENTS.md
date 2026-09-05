# AGENTS.md — Constitución de Ingeniería y Directivas de Arquitectura
## Empresarial SaaS (Payload CMS 3.x · Next.js 15 · Supabase)

> Este archivo define las directivas no-negociables para cualquier agente o desarrollador que trabaje en este repositorio.

---

## 1. Estándar Operativo No Negociable (Rigor Nivel Opus/Sonnet)
- **Pensar antes de actuar:** Analizar contratos de datos, dependencias cruzadas y radio de impacto antes de modificar cualquier archivo.
- **Cero código destructivo:** Prohibido borrar comentarios explicativos, eliminar utilidades no referenciadas o insertar atajos tipo `// rest remains the same`.
- **TypeScript Estricto:** Prohibido eludir el tipado con `any`, `unknown` forzados o `@ts-ignore` sin justificación técnica crítica documentada.
- **Cero Espera de Builds o Bots (Crear PR y Terminar):** Prohibido esperar activamente (`sleep`, polling o chequeos repetitivos) a que terminen los builds de Vercel, CI o reviews externos como Devin Review. Una vez abierto el Pull Request, el agente DEBE entregar el enlace al PR y TERMINAR su respuesta inmediatamente sin esperar. El usuario es quien revisa los builds y las revisiones externas.

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

### 2.1 Organización Canónica del Código (convención del repo, Fase 3)
Cada capa tiene una responsabilidad única. Si un cambio acopla dos o más dominios, es un **plugin**; si pertenece a un solo dominio, vive en su colección; si es negocio puro sin cableado de config, es una **utility**:

| Capa | Ruta | Contiene | NO contiene |
|---|---|---|---|
| **Colecciones** | `src/collections/<Dominio>/index.ts` | `CollectionConfig` puro: schema, acceso, hooks propios del dominio | Acoplamientos hacia otras colecciones ni campos que inyecta un plugin |
| **Plugins in-repo** | `src/plugins/<dominio>.ts` | `(options) => (config) => Config`: campos inyectados (mapeando la colección y haciendo spread), hooks compuestos (`[miHook, ...(existentes || [])]`), colecciones/endpoints que registra el dominio. Opción `enabled` por instalación | Lógica de negocio pesada (va en utilities) |
| **Utilities** | `src/utilities/*.ts` | Lógica de negocio: ledgers con locks `FOR UPDATE`, idempotencia estructural, snapshots, helpers puros | Cableado del config de Payload ni UI |
| **Server Actions** | `src/actions/*.ts` | Superficie de Next.js: entrada de usuario con Zod (`src/utilities/erpValidation.ts`), autorización (`src/utilities/erpAuth.ts`), transacciones (`withTransaction`) | — |
| **UI (RSC/Client)** | `src/app/(app)/[tenant]/erp/*` + `src/components/erp/*` | Páginas y vistas. Consume la Local API en RSC y las Server Actions en cliente | — |
| **Jobs** | `src/jobs/*.ts` | `TaskConfig` del Jobs Queue; el usuario que autorizó viaja en el input y se rehidrata | — |

Reglas derivadas:
1. El acoplamiento venta→inventario (`salesInventoryPlugin`) es la referencia del patrón; los sprints siguientes (precios, auditoría) lo replican (`pricingPlugin`, `auditPlugin`).
2. Las Server Actions y las páginas RSC son superficie de Next.js, **no** del config de Payload: no son "pluggables".
3. Los plugins in-repo se registran en `payload.config.ts` con opción `enabled` (base para módulos por plan). Prohibido revivir wrappers especulativos sin BD (el error de la fase abandonada, PRs #1–#6).
4. El usuario que autoriza una operación viaja siempre en el input del job/acción y se revalida en cada intento (RBAC real con `overrideAccess: false` o verificación explícita).

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

---

## 5. Protocolo de Entrega y Cero Espera (Zero Build/Bot Waiting)
- **Cero Espera Activa:** Prohibido terminantemente ejecutar comandos `sleep` o bucles de verificación para aguardar builds de Vercel, CI o revisiones de bots (Devin Review, etc.).
- **Ciclo de Cierre Inmediato:** Una vez creadas las migraciones, verificados los tipos con TypeScript (`tsc --noEmit`), comiteado y abierto el Pull Request:
  1. Dejar el link del PR en la respuesta.
  2. Terminar el turno de inmediato.
- **Responsabilidad del Usuario:** El usuario revisa los builds remotos y los comentarios de Devin en GitHub, y solicitará los ajustes pertinentes en turnos posteriores.

