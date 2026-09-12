import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPayload } from 'payload';
import type { Payload, PayloadRequest } from 'payload';
import config from '@payload-config';
import type { InventoryCount, Product, StockMovement, User, Warehouse } from '@/payload-types';
import { completeInventoryCount, lockInventoryCount } from '@/utilities/inventoryCounts';

/**
 * ─── Integración: finalización de conteos de inventario (Sprint R1) ─────────
 *
 * Reproduce el hallazgo P1 de la auditoría 2026-09-11 (SECTOR-2, S2-1): sin un
 * advisory lock por conteo, dos finalizaciones concurrentes del MISMO conteo
 * leían `status: in_progress` y aplicaban los ajustes DOS veces sobre el Kardex
 * (stock corrupto). El fix toma `pg_advisory_xact_lock(hashtext('inventorycount:id'))`
 * y relee el conteo dentro de la transacción para que la validación de
 * "ya completado" sea definitiva.
 *
 * Corre contra Postgres REAL (local 54322 / service container de CI). Los datos
 * llevan sufijo único por corrida y quedan en la BD de pruebas desechable
 * (setupEnv.ts aborta si la URL no es loopback).
 */

const RUN = Date.now().toString(36);

let payload: Payload;
let tenantId: number;
let warehouseId: number;
let userId: number;
let userDoc: User;

beforeAll(async () => {
  payload = await getPayload({ config });

  const tenant = await payload.create({
    collection: 'tenants',
    data: {
      name: `QA Conteo ${RUN}`,
      slug: `qa-conteo-${RUN}`,
      salesConfig: { salesDocumentDefault: 'factura' },
    },
    overrideAccess: true,
  });
  tenantId = tenant.id;

  const warehouse = (await payload.create({
    collection: 'warehouses',
    data: {
      tenant: tenantId,
      name: 'Almacén Conteo QA',
      code: `QAC-${RUN}`,
      type: 'main',
      isDefault: true,
      isActive: true,
    },
    overrideAccess: true,
  })) as unknown as Warehouse;
  warehouseId = warehouse.id;

  const user = (await payload.create({
    collection: 'users',
    data: {
      email: `qa-conteo-${RUN}@example.com`,
      name: 'QA Conteo R1',
      role: 'super-admin',
      password: 'test-12345678',
    },
    overrideAccess: true,
  })) as unknown as User;
  userId = user.id;
  userDoc = user;
});

afterAll(async () => {
  const db = (payload as unknown as { db?: { destroy?: () => Promise<void> } }).db;
  if (db?.destroy) await db.destroy();
});

async function createPhysicalProduct(name: string): Promise<number> {
  const product = (await payload.create({
    collection: 'products',
    data: {
      tenant: tenantId,
      name: `Producto Conteo ${name}`,
      sku: `QAC-${name}-${RUN}`,
      productType: 'standard',
      unitOfMeasure: 'unit',
      costUSD: 5,
      priceUSD: 10,
      taxRate: 'exempt',
      trackInventory: true,
    },
    draft: false,
    overrideAccess: true,
  })) as unknown as Product;
  return product.id;
}

/** Conteo con snapshot 0 y una cantidad contada → delta positivo (entrada). */
async function createCount(productId: number, countedQty: number): Promise<InventoryCount> {
  return (await payload.create({
    collection: 'inventory-counts',
    data: {
      tenant: tenantId,
      warehouse: warehouseId,
      status: 'in_progress',
      items: [{ product: productId, systemQty: 0, countedQty }],
    },
    draft: false,
    overrideAccess: true,
  })) as unknown as InventoryCount;
}

/**
 * Ejecuta `completeInventoryCount` dentro de una transacción propia, replicando
 * el patrón `withTransaction` de las Server Actions (no exportado).
 */
async function completeInTransaction(
  countId: number,
): Promise<{ ok: true; value: number } | { ok: false; error: Error }> {
  const transactionID = await payload.db.beginTransaction();
  const req = {
    payload,
    user: userDoc,
    context: {},
    transactionID,
  } as unknown as PayloadRequest;

  try {
    const value = await completeInventoryCount({
      countId,
      expectedTenantId: tenantId,
      completedBy: userId,
      req,
    });
    if (transactionID) await payload.db.commitTransaction(transactionID);
    return { ok: true, value };
  } catch (error) {
    if (transactionID) await payload.db.rollbackTransaction(transactionID);
    return { ok: false, error: error as Error };
  }
}

async function currentStock(productId: number): Promise<number> {
  const product = await payload.findByID({ collection: 'products', id: productId, overrideAccess: true });
  return Number((product as unknown as Product).currentStock) || 0;
}

async function adjustmentsFor(countId: number): Promise<StockMovement[]> {
  const res = await payload.find({
    collection: 'stock-movements',
    where: { reference: { equals: `CONTEO-${countId}` } },
    pagination: false,
    overrideAccess: true,
  });
  return res.docs as StockMovement[];
}

describe('conteos de inventario — finalización (regresión P1 / S2-1)', () => {
  it('una finalización aplica el ajuste una sola vez', async () => {
    const product = await createPhysicalProduct('simple');
    const count = await createCount(product, 5);

    const result = await completeInTransaction(count.id);
    expect(result.ok).toBe(true);
    expect(await currentStock(product)).toBe(5);

    const countAfter = (await payload.findByID({
      collection: 'inventory-counts',
      id: count.id,
      overrideAccess: true,
    })) as unknown as InventoryCount;
    expect(countAfter.status).toBe('completed');
    expect(await adjustmentsFor(count.id)).toHaveLength(1);
  });

  it('dos finalizaciones concurrentes del MISMO conteo NO duplican el ajuste', async () => {
    const product = await createPhysicalProduct('race');
    const count = await createCount(product, 7);

    const [a, b] = await Promise.all([completeInTransaction(count.id), completeInTransaction(count.id)]);

    const outcomes = [a, b];
    const successes = outcomes.filter((o) => o.ok);
    const failures = outcomes.filter((o) => !o.ok);

    // Exactamente una gana; la otra queda bloqueada por el lock y, al releer el
    // conteo ya completado, se rechaza.
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    const rejected = failures[0] as { ok: false; error: Error };
    expect(rejected.error.message).toMatch(/ya está completado/i);

    // El Kardex quedó con UN solo movimiento y el stock con UNA sola aplicación.
    expect(await adjustmentsFor(count.id)).toHaveLength(1);
    expect(await currentStock(product)).toBe(7);
  });

  it('un guardado de cantidades concurrente se serializa con la finalización (Devin #86)', async () => {
    const product = await createPhysicalProduct('save-race');
    const count = await createCount(product, 5);

    // Réplica del protocolo de `saveCountedItemsAction`: lock por conteo → relee
    // el estado bajo el lock → (si sigue en progreso) escribe las cantidades.
    const saveTask = (async () => {
      const transactionID = await payload.db.beginTransaction();
      const req = {
        payload,
        user: userDoc,
        context: {},
        transactionID,
      } as unknown as PayloadRequest;
      try {
        const lockedId = await lockInventoryCount(count.id, req);
        if (!lockedId) return { ok: false as const };

        const fresh = (await payload.findByID({
          collection: 'inventory-counts',
          id: count.id,
          depth: 0,
          req,
          overrideAccess: true,
        })) as unknown as InventoryCount;
        if (fresh.status === 'completed') {
          await payload.db.rollbackTransaction(transactionID as string | number);
          return { ok: false as const };
        }

        await payload.update({
          collection: 'inventory-counts',
          id: count.id,
          data: { items: [{ product, systemQty: 0, countedQty: 8 }] as never },
          req,
          overrideAccess: true,
        });
        if (transactionID) await payload.db.commitTransaction(transactionID);
        return { ok: true as const };
      } catch {
        if (transactionID) await payload.db.rollbackTransaction(transactionID);
        return { ok: false as const };
      }
    })();

    await Promise.all([saveTask, completeInTransaction(count.id)]);

    // INVARIANTE (independiente del orden que gane el lock): un conteo completado
    // debe concordar con su Kardex. Sin el lock compartido, el guardado podía
    // persistir 8 unidades DESPUÉS de que la finalización aplicara 5 → divergencia.
    const finalCount = (await payload.findByID({
      collection: 'inventory-counts',
      id: count.id,
      depth: 0,
      overrideAccess: true,
    })) as unknown as InventoryCount;
    const persistedCountedQty = Number(
      (finalCount.items?.[0] as { countedQty?: number } | undefined)?.countedQty,
    );

    expect(finalCount.status).toBe('completed');
    expect(await adjustmentsFor(count.id)).toHaveLength(1);
    expect(await currentStock(product)).toBe(persistedCountedQty);
  });
});

