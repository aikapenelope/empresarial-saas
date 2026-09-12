import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPayload } from 'payload';
import type { Payload, PayloadRequest } from 'payload';
import config from '@payload-config';
import type { Product, User } from '@/payload-types';
import { importStockToWarehouse, planStockImport } from '@/utilities/inventoryImport';
import { getProductWarehouseStock } from '@/utilities/inventoryLedger';

/**
 * ─── Importación masiva de inventario (Sprint CI-3) ─────────────────────────
 *
 * El wizard de importación tiene dos mitades: `planStockImport` (previsualiza sin
 * escribir) y `importStockToWarehouse` (COMMIT: locks de saldo, decisiones y
 * movimientos de kardex en la transacción del llamador). La agregación pura ya
 * está cubierta en `tests/unit/inventoryImport.test.ts`; aquí se prueba el
 * efecto REAL sobre el Kardex.
 *
 * Invariantes:
 *  - el PLAN no muta existencias,
 *  - `adjust` aplica el delta neto; `set` lleva la existencia al valor pedido,
 *  - un SKU desconocido o sin kardex genera una fila de ERROR (nunca silencio),
 *  - el stock final coincide con lo esperado.
 */

const RUN = Date.now().toString(36);

let payload: Payload;
let tenantId: number;
let warehouseId: number;
let user: User;

beforeAll(async () => {
  payload = await getPayload({ config });

  const tenant = await payload.create({
    collection: 'tenants',
    data: { name: `QA Import ${RUN}`, slug: `qa-import-${RUN}`, salesConfig: { salesDocumentDefault: 'factura' } },
    overrideAccess: true,
  });
  tenantId = tenant.id;

  user = (await payload.create({
    collection: 'users',
    data: {
      email: `qa-import-${RUN}@example.com`,
      name: 'QA Import',
      role: 'tenant-admin',
      password: 'test-12345678',
      // El hook de Kardex valida el inquilino contra los inquilinos del usuario.
      tenants: [{ tenant: tenantId }],
    },
    overrideAccess: true,
  })) as unknown as User;

  const warehouse = await payload.create({
    collection: 'warehouses',
    data: { tenant: tenantId, name: `Almacén Import ${RUN}`, code: `IMP-${RUN}`, type: 'main', isDefault: true, isActive: true },
    overrideAccess: true,
  });
  warehouseId = warehouse.id;
});

afterAll(async () => {
  const handle = payload.db as unknown as { destroy?: () => Promise<void> };
  if (handle?.destroy) await handle.destroy();
});

function fakeReq(): PayloadRequest {
  return { payload, context: {}, user } as unknown as PayloadRequest;
}

let seq = 0;

async function createProduct({ trackInventory = true, productType = 'standard' }: { trackInventory?: boolean; productType?: 'standard' | 'service' } = {}): Promise<Product> {
  seq++;
  return (await payload.create({
    collection: 'products',
    data: {
      tenant: tenantId,
      name: `Import P${seq} ${RUN}`,
      sku: `IMPP${RUN}${seq}`,
      productType,
      unitOfMeasure: 'unit',
      costUSD: 6,
      priceUSD: 12,
      taxRate: 'exempt',
      trackInventory,
    },
    draft: false,
    overrideAccess: true,
  })) as unknown as Product;
}

async function seedStock(productId: number, quantity: number): Promise<void> {
  if (quantity === 0) return;
  await payload.create({
    collection: 'stock-movements',
    data: {
      reference: `SEED-IMP-${RUN}-${productId}`,
      movementType: 'purchase_in',
      product: productId,
      targetWarehouse: warehouseId,
      quantity,
      unitCostUSD: 6,
      totalCostUSD: quantity * 6,
      tenant: tenantId,
      reason: 'Semilla para la prueba de importación',
    },
    draft: false,
    overrideAccess: true,
  });
}

async function stock(productId: number): Promise<number> {
  return getProductWarehouseStock(productId, warehouseId, fakeReq());
}

describe('importación masiva de inventario (CI-3)', () => {
  it('el PLAN previsualiza el movimiento SIN tocar las existencias', async () => {
    const product = await createProduct();

    const plan = await planStockImport({
      tenantId,
      warehouseId,
      mode: 'adjust',
      rows: [{ sku: product.sku as string, quantity: 10 }],
      req: fakeReq(),
    });

    expect(plan.movements).toHaveLength(1);
    expect(plan.movements[0].movementType).toBe('adjustment_positive');
    expect(plan.movements[0].quantity).toBe(10);
    expect(plan.rowsProcessed).toBe(1);

    // El plan no escribe: el stock sigue en 0.
    expect(await stock(product.id)).toBe(0);
  });

  it('modo `adjust` aplica el delta neto agregado por SKU', async () => {
    const product = await createProduct();
    await seedStock(product.id, 5);

    const summary = await importStockToWarehouse({
      tenantId,
      warehouseId,
      mode: 'adjust',
      // +7 y −2 del MISMO SKU ⇒ delta neto +5.
      rows: [
        { sku: product.sku as string, quantity: 7 },
        { sku: product.sku as string, quantity: -2 },
      ],
      req: fakeReq(),
    });

    expect(summary.movementsCreated).toBe(1);
    expect(await stock(product.id)).toBe(10);
  });

  it('modo `set` lleva la existencia al valor absoluto pedido', async () => {
    const product = await createProduct();
    await seedStock(product.id, 12);

    // Bajar a 8 ⇒ adjustment_negative de 4.
    const summary = await importStockToWarehouse({
      tenantId,
      warehouseId,
      mode: 'set',
      rows: [{ sku: product.sku as string, quantity: 8 }],
      req: fakeReq(),
    });

    expect(summary.movementsCreated).toBe(1);
    expect(await stock(product.id)).toBe(8);
  });

  it('un SKU desconocido genera fila de ERROR y no escribe nada', async () => {
    const summary = await importStockToWarehouse({
      tenantId,
      warehouseId,
      mode: 'adjust',
      rows: [{ sku: `NO-EXISTE-${RUN}`, quantity: 5 }],
      req: fakeReq(),
    });

    expect(summary.movementsCreated).toBe(0);
    expect(summary.results.some((r) => r.status === 'error' && /no encontrado/i.test(r.message ?? ''))).toBe(true);
  });

  it('un producto que NO controla existencias se reporta como error', async () => {
    const service = await createProduct({ trackInventory: false, productType: 'service' });

    const summary = await importStockToWarehouse({
      tenantId,
      warehouseId,
      mode: 'adjust',
      rows: [{ sku: service.sku as string, quantity: 5 }],
      req: fakeReq(),
    });

    expect(summary.movementsCreated).toBe(0);
    expect(summary.results.some((r) => r.status === 'error')).toBe(true);
  });
});

