import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPayload } from 'payload';
import type { Payload, PayloadRequest } from 'payload';
import config from '@payload-config';
import type { Product, ProductionOrder, User } from '@/payload-types';
import { executeProductionOrder, getProductWarehouseStock } from '@/utilities/inventoryLedger';

/**
 * ─── Ciclo de producción (BOM → consumo → alta de terminado) — Sprint CI-3 ──
 *
 * Es el proceso físico más delicado del ERP: consume insumos del almacén origen y
 * da de alta el producto terminado en el destino, dentro de la transacción del
 * llamador y con locks ordenados por id de producto (anti-deadlock).
 *
 * Invariantes que se fijan con NÚMEROS:
 *  - consumo = cantidad BOM × multiplicador de lote × (1 + merma%),
 *  - el terminado entra SOLO en el almacén destino,
 *  - costeo: totalBatch = Σ(cantidad efectiva × costo unitario del insumo),
 *  - IDEMPOTENCIA: reintentar la ejecución no vuelve a consumir ni a dar de alta,
 *  - stock insuficiente ABORTA sin dejar consumos a medias.
 */

const RUN = Date.now().toString(36);

type Row = Record<string, unknown>;

let payload: Payload;
let tenantId: number;
let userId: number;
let sourceWarehouseId: number;
let targetWarehouseId: number;
let user: User;

beforeAll(async () => {
  payload = await getPayload({ config });

  const tenant = await payload.create({
    collection: 'tenants',
    data: { name: `QA Prod ${RUN}`, slug: `qa-prod-${RUN}`, salesConfig: { salesDocumentDefault: 'factura' } },
    overrideAccess: true,
  });
  tenantId = tenant.id;

  user = (await payload.create({
    collection: 'users',
    data: { email: `qa-prod-${RUN}@example.com`, name: 'QA Prod', role: 'tenant-admin', password: 'test-12345678' },
    overrideAccess: true,
  })) as unknown as User;
  userId = user.id;

  const source = await payload.create({
    collection: 'warehouses',
    data: { tenant: tenantId, name: `Insumos ${RUN}`, code: `INS-${RUN}`, type: 'main', isDefault: true, isActive: true },
    overrideAccess: true,
  });
  sourceWarehouseId = source.id;

  const target = await payload.create({
    collection: 'warehouses',
    data: { tenant: tenantId, name: `Terminados ${RUN}`, code: `TER-${RUN}`, type: 'main', isActive: true },
    overrideAccess: true,
  });
  targetWarehouseId = target.id;
});

afterAll(async () => {
  const handle = payload.db as unknown as { destroy?: () => Promise<void> };
  if (handle?.destroy) await handle.destroy();
});

/** req mínimo para utilidades que sólo necesitan la Local API y el handle SQL. */
function fakeReq(): PayloadRequest {
  return { payload, context: {}, user } as unknown as PayloadRequest;
}

let skuSeq = 0;

async function createProduct(name: string, costUSD: number): Promise<Product> {
  skuSeq++;
  return (await payload.create({
    collection: 'products',
    data: {
      tenant: tenantId,
      name: `Prod ${name} ${RUN}`,
      sku: `P-${RUN}-${skuSeq}`,
      productType: 'standard',
      unitOfMeasure: 'unit',
      costUSD,
      priceUSD: costUSD * 2,
      taxRate: 'exempt',
      trackInventory: true,
    },
    draft: false,
    overrideAccess: true,
  })) as unknown as Product;
}

async function seedStock(productId: number, warehouseId: number, quantity: number, unitCostUSD: number): Promise<void> {
  await payload.create({
    collection: 'stock-movements',
    data: {
      reference: `SEED-PROD-${RUN}-${productId}`,
      movementType: 'purchase_in',
      product: productId,
      targetWarehouse: warehouseId,
      quantity,
      unitCostUSD,
      totalCostUSD: quantity * unitCostUSD,
      tenant: tenantId,
      reason: 'Semilla de insumos para la prueba de producción',
    },
    draft: false,
    overrideAccess: true,
  });
}

async function createBom(finished: Product, items: Array<{ rawMaterial: number; quantity: number; scrapFactorPercent?: number }>): Promise<number> {
  const bom = await payload.create({
    collection: 'bill-of-materials',
    data: {
      tenant: tenantId,
      name: `BOM ${RUN}-${finished.id}`,
      product: finished.id,
      outputQuantity: 1,
      items,
      isActive: true,
    },
    draft: false,
    overrideAccess: true,
  });
  return (bom as unknown as Row).id as number;
}

async function createOrder({
  finished,
  bomId,
  quantityPlanned,
  status = 'planned',
}: {
  finished: Product;
  bomId: number;
  quantityPlanned: number;
  status?: 'draft' | 'planned' | 'in_progress' | 'completed';
}): Promise<ProductionOrder> {
  return (await payload.create({
    collection: 'production-orders',
    data: {
      tenant: tenantId,
      orderNumber: `OP-${RUN}-${skuSeq}-${Math.floor(Math.random() * 100000)}`,
      product: finished.id,
      bom: bomId,
      quantityPlanned,
      quantityProduced: quantityPlanned,
      sourceWarehouse: sourceWarehouseId,
      targetWarehouse: targetWarehouseId,
      status,
      startDate: new Date().toISOString(),
      assignedTo: userId,
    },
    draft: false,
    overrideAccess: true,
  })) as unknown as ProductionOrder;
}

async function warehouseStock(productId: number, warehouseId: number): Promise<number> {
  return getProductWarehouseStock(productId, warehouseId, fakeReq());
}

describe('producción — BOM, consumo y alta de terminado (CI-3)', () => {
  it('completar la orden consume los insumos del origen y da de alta el terminado en el destino', async () => {
    const rawA = await createProduct('InsumoA', 5);
    const rawB = await createProduct('InsumoB', 10);
    const finished = await createProduct('Terminado', 0);

    await seedStock(rawA.id, sourceWarehouseId, 10, 5);
    await seedStock(rawB.id, sourceWarehouseId, 4, 10);

    const bomId = await createBom(finished, [
      { rawMaterial: rawA.id, quantity: 2 },
      { rawMaterial: rawB.id, quantity: 1 },
    ]);

    // Orden por 3 unidades. BOM: 2 × A + 1 × B por unidad terminada.
    const order = await createOrder({ finished, bomId, quantityPlanned: 3 });

    // La transición a completada dispara la ejecución atómica.
    await payload.update({
      collection: 'production-orders',
      id: order.id,
      data: { status: 'completed', quantityProduced: 3, completionDate: new Date().toISOString() },
      draft: false,
      overrideAccess: true,
    });

    // Los costos los asienta el hook afterChange → se releen del documento.
    const completed = (await payload.findByID({
      collection: 'production-orders',
      id: order.id,
      depth: 0,
      overrideAccess: true,
    })) as unknown as ProductionOrder;

    // Consumo: A 10 − 6 = 4; B 4 − 3 = 1.
    expect(await warehouseStock(rawA.id, sourceWarehouseId)).toBe(4);
    expect(await warehouseStock(rawB.id, sourceWarehouseId)).toBe(1);

    // Alta del terminado SOLO en el almacén destino.
    expect(await warehouseStock(finished.id, targetWarehouseId)).toBe(3);
    expect(await warehouseStock(finished.id, sourceWarehouseId)).toBe(0);

    // Costeo: 6 × 5 + 3 × 10 = 60 de lote ⇒ 20 por unidad.
    expect(Number(completed.totalCostUSD)).toBe(60);
    expect(Number(completed.unitCostUSD)).toBe(20);
  });

  it('aplica la MERMA del BOM al consumo (scrapFactorPercent)', async () => {
    const raw = await createProduct('InsumoMerma', 2);
    const finished = await createProduct('TerminadoMerma', 0);
    await seedStock(raw.id, sourceWarehouseId, 100, 2);

    // 1 unidad de insumo por unidad, con 10 % de merma.
    const bomId = await createBom(finished, [
      { rawMaterial: raw.id, quantity: 1, scrapFactorPercent: 10 },
    ]);

    const order = await createOrder({ finished, bomId, quantityPlanned: 10 });

    await payload.update({
      collection: 'production-orders',
      id: order.id,
      data: { status: 'completed', quantityProduced: 10, completionDate: new Date().toISOString() },
      draft: false,
      overrideAccess: true,
    });

    // 10 unidades × 1 × 1.10 = 11 consumidas.
    expect(await warehouseStock(raw.id, sourceWarehouseId)).toBe(89);
  });

  it('IDEMPOTENCIA: reejecutar no vuelve a consumir ni a dar de alta', async () => {
    const raw = await createProduct('InsumoIdem', 3);
    const finished = await createProduct('TerminadoIdem', 0);
    await seedStock(raw.id, sourceWarehouseId, 10, 3);

    const bomId = await createBom(finished, [{ rawMaterial: raw.id, quantity: 1 }]);
    const order = await createOrder({ finished, bomId, quantityPlanned: 2 });

    await payload.update({
      collection: 'production-orders',
      id: order.id,
      data: { status: 'completed', quantityProduced: 2, completionDate: new Date().toISOString() },
      draft: false,
      overrideAccess: true,
    });

    const rawBefore = await warehouseStock(raw.id, sourceWarehouseId);
    const finishedBefore = await warehouseStock(finished.id, targetWarehouseId);

    // Reintento explícito de la ejecución (como un retry del job/hook).
    const tx = await payload.db.beginTransaction();
    const req = { payload, context: {}, user, transactionID: tx } as unknown as PayloadRequest;
    let result: { totalBatchCostUSD: number; unitCostUSD: number };
    try {
      result = await executeProductionOrder({ orderId: order.id, quantityProduced: 2 }, req);
      if (tx) await payload.db.commitTransaction(tx);
    } catch (error) {
      if (tx) await payload.db.rollbackTransaction(tx);
      throw error;
    }

    // Devuelve los costos YA asentados y no mueve inventario.
    expect(result.totalBatchCostUSD).toBe(6);
    expect(result.unitCostUSD).toBe(3);
    expect(await warehouseStock(raw.id, sourceWarehouseId)).toBe(rawBefore);
    expect(await warehouseStock(finished.id, targetWarehouseId)).toBe(finishedBefore);
  });

  it('stock insuficiente ABORTA sin consumos a medias', async () => {
    const raw = await createProduct('InsumoEscaso', 4);
    const finished = await createProduct('TerminadoEscaso', 0);
    await seedStock(raw.id, sourceWarehouseId, 3, 4);

    const bomId = await createBom(finished, [{ rawMaterial: raw.id, quantity: 1 }]);
    const order = await createOrder({ finished, bomId, quantityPlanned: 10 });

    await expect(
      payload.update({
        collection: 'production-orders',
        id: order.id,
        data: { status: 'completed', quantityProduced: 10, completionDate: new Date().toISOString() },
        draft: false,
        overrideAccess: true,
      }),
    ).rejects.toThrow(/Stock insuficiente/i);

    // El insumo queda intacto y el terminado no se dio de alta.
    expect(await warehouseStock(raw.id, sourceWarehouseId)).toBe(3);
    expect(await warehouseStock(finished.id, targetWarehouseId)).toBe(0);
  });
});

