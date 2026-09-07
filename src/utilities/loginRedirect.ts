/**
 * Destino tras el login del ERP (Sprint 34 · Fase 8):
 * - super-admin → selector de empresas (desde donde también puede abrir el admin de Payload).
 * - Un solo tenant → directo a su ERP (/mi-empresa/erp).
 * - Varios → selector de empresas.
 * - Ninguno → null (la pantalla de login muestra el aviso).
 * Helper puro: lo usan el RSC de /login y el LoginForm en cliente.
 */
/**
 * Valida un redirect interno: sólo rutas absolutas del propio origen.
 * Rechaza protocol-relative (//host) y backslashes (/\\host) — ambos son
 * vectores de open-redirect aunque el valor empiece por '/'.
 */
export function safeInternalPath(value?: string | null): string | undefined {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return undefined;
  }
  return value;
}

export function resolvePostLoginTarget(user: {
  role?: string | null;
  tenants?: Array<{ tenant?: number | { slug?: string } | null } | null> | null;
}): string | null {
  if (user.role === 'super-admin') return '/';

  const tenantSlugs = (user.tenants ?? [])
    .map((membership) => membership?.tenant)
    .filter((tenant): tenant is { slug?: string } => typeof tenant === 'object' && tenant !== null)
    .map((tenant) => tenant.slug)
    .filter((slug): slug is string => Boolean(slug));

  if (tenantSlugs.length === 1) return `/${tenantSlugs[0]}/erp`;
  if (tenantSlugs.length > 1) return '/';
  return null;
}
