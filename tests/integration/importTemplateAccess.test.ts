import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPayload } from 'payload';
import type { Payload } from 'payload';
import config from '@payload-config';
import type { User } from '@/payload-types';

/**
 * ─── Integración: acceso de lectura de la plantilla (Sprint R2 · S6-1) ──────
 *
 * El route handler de la plantilla de inventario consulta `products` con
 * `overrideAccess: false`. Si NO se pasa `user`, el access `Boolean(user)` de
 * `products` evalúa como anónimo y la Local API rechaza con Forbidden → el route
 * respondía 500 y el usuario no podía descargar la plantilla. Este test fija esa
 * premisa: con `user` llegan los productos; sin `user` la Local API rechaza.
 */

const RUN = Date.now().toString(36);

let payload: Payload;
let tenantId: number;
let user: User;

beforeAll(async () => {
  payload = await getPayload({ config });

  const tenant = await payload.create({
    collection: 'tenants',
    data: {
      name: `QA Plantilla ${RUN}`,
      slug: `qa-plantilla-${RUN}`,
      salesConfig: { salesDocumentDefault: 'factura' },
    },
    overrideAccess: true,
  });
  tenantId = tenant.id;

  user = (await payload.create({
    collection: 'users',
    data: {
      email: `qa-plantilla-${RUN}@example.com`,
      name: 'QA Plantilla',
      role: 'super-admin',
      password: 'test-12345678',
    },
    overrideAccess: true,
  })) as unknown as User;

  await payload.create({
    collection: 'products',
    data: {
      tenant: tenantId,
      name: `Producto Plantilla ${RUN}`,
      sku: `QAT-${RUN}`,
      productType: 'standard',
      unitOfMeasure: 'unit',
      costUSD: 1,
      priceUSD: 2,
      taxRate: 'exempt',
      trackInventory: true,
    },
    draft: false,
    overrideAccess: true,
  });
});

afterAll(async () => {
  const db = (payload as unknown as { db?: { destroy?: () => Promise<void> } }).db;
  if (db?.destroy) await db.destroy();
});

describe('plantilla de inventario — acceso de lectura (S6-1)', () => {
  it('con `user` el catálogo llega; sin `user` la Local API rechaza (Forbidden)', async () => {
    const withUser = await payload.find({
      collection: 'products',
      where: { tenant: { equals: tenantId } },
      pagination: false,
      depth: 0,
      user,
      overrideAccess: false,
    });
    expect(withUser.docs.length).toBeGreaterThan(0);

    // Sin `user`, `overrideAccess: false` deja actuar al access `Boolean(user)`
    // de products → Payload rechaza con Forbidden (el route respondía 500 y el
    // usuario no podía descargar la plantilla). El fix pasa el `user` verificado.
    await expect(
      payload.find({
        collection: 'products',
        where: { tenant: { equals: tenantId } },
        pagination: false,
        depth: 0,
        overrideAccess: false,
      }),
    ).rejects.toThrow(/permiso|forbidden/i);
  });
});
