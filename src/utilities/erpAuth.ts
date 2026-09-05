import { headers } from 'next/headers';
import { getPayload } from 'payload';
import config from '@payload-config';
import type { User } from '@/payload-types';

export class ErpAccessError extends Error {
  status: 401 | 403;

  constructor(status: 401 | 403, message: string) {
    super(message);
    this.status = status;
    this.name = 'ErpAccessError';
  }
}

/**
 * Resuelve el usuario autenticado de la sesión de Payload (cookie payload-token)
 * dentro de Server Components / Server Actions. Devuelve null si no hay sesión válida.
 */
export async function getErpUser(): Promise<User | null> {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({
    headers: (await headers()) as unknown as Headers,
  });

  if (!user?.id) {
    return null;
  }

  const userDoc = await payload.findByID({
    collection: 'users',
    id: user.id as number,
    depth: 0,
  });

  return (userDoc as User) || null;
}

/**
 * Verifica que exista sesión y que el usuario tenga acceso operativo al inquilino:
 * super-admin tiene acceso global; cualquier otro rol debe pertenecer al inquilino
 * vía su array `tenants` (blindado en el JWT). Lanza ErpAccessError en caso contrario.
 */
export async function requireErpTenantAccess(tenantId: number | string): Promise<User> {
  const user = await getErpUser();

  if (!user) {
    throw new ErpAccessError(401, 'No autenticado: inicie sesión para acceder al ERP.');
  }

  if (user.role !== 'super-admin') {
    const userTenants = (
      (user as unknown as { tenants?: Array<{ tenant: number | { id: number } }> })?.tenants || []
    ).map((t) => (typeof t.tenant === 'object' && t.tenant !== null ? t.tenant.id : t.tenant));

    if (!userTenants.map(String).includes(String(tenantId))) {
      throw new ErpAccessError(403, 'Prohibido: no tiene acceso a este inquilino.');
    }
  }

  return user;
}

/** Verifica privilegios administrativos (super-admin) para operaciones globales. */
export async function requireSuperAdmin(): Promise<User> {
  const user = await getErpUser();

  if (!user) {
    throw new ErpAccessError(401, 'No autenticado: inicie sesión para continuar.');
  }

  if (user.role !== 'super-admin') {
    throw new ErpAccessError(403, 'Prohibido: se requieren privilegios de super-administrador.');
  }

  return user;
}
