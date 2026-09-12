import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPayload } from 'payload';
import type { Payload, PayloadRequest } from 'payload';
import config from '@payload-config';
import type { Customer, Invoice, Product, StockMovement, User, Warehouse } from '@/payload-types';
import { extractId } from '@/utilities/inventoryLedger';
import { returnSaleLines } from '@/utilities/salesLedger';

/**
 * ─── Integración: costo del reingreso por devolución (Sprint R2 · S4-1) ─────
 *
 * Al anular una factura, el `sale_return` debe reingresar las unidades al COSTO
 * de la venta original (promedio ponderado de los `sale_out`), no en 0. Antes se
 * creaba con `unitCostUSD: 0`, subvaluando el Kardex.
 */

const RUN = Date.now().toString(36);

let payload: Payload;
let tenantId: number;
let warehouseId: number;
let customerId: number;
let userDoc: User;

beforeAll(async () => {
  payload = await getPayload({ config });

  const tenant = await payload.create({
    collection: 'tenants',
    data: { name: `QA Retorno ${RUN}`, slug: `qa-retorno-${RUN}`, salesConfig: { salesDocumentDefault: 'factura' } },
    overrideAccess: true,
  });
  tenantId = tenant.id;

  const warehouse = (await payload.create({
    collection: 'warehouses',
    data: { tenant: tenantId, name: 'Almacén Retorno QA', code: `QAR-${RUN}`, type: 'main', isDefault: true, isActive: true },
    overrideAccess: true,
  })) as unknown as Warehouse;
  warehouseId = warehouse.id;

  const customer = (await payload.create({
    collection: 'customers',
    data: { tenant: tenantId, name: `Cliente Retorno ${RUN}`, taxId: `JR-${RUN}`, phone: '0000000000', status: 'lead' },
    draft: false,
    overrideAccess: true,
  })) as unknown as Customer;
  customerId = customer.id;

  // El Kardex valida pertenencia al inquilino contra `req.user` (no basta con
  // un id): se necesita el documento completo del usuario.
  userDoc = (await payload.create({
    collection: 'users',
    data: { email: `qa-retorno-${RUN}@example.com`, name: 'QA Retorno', role: 'super-admin', password: 'test-12345678' },
    overrideAccess: true,
  })) as unknown as User;
});

afterAll(async () => {
  const db = (payload as unknown as { db?: { destroy?: () => Promise<void> } }).db;
  if (db?.destroy) await db.destroy();
});

async function createProductWithCost(unitCostUSD: number, tag = ''): Promise<number> {
  const product = (await payload.create({
    collection: 'products',
    data: {
      tenant: tenantId,
      name: `Producto Retorno ${RUN}${tag}`,
      sku: `QAR-P-${RUN}-${unitCostUSD}${tag}`,
      productType: 'standard',
      unitOfMeasure: 'unit',
      costUSD: unitCostUSD,
      priceUSD: unitCostUSD * 2,
      taxRate: 'exempt',
      trackInventory: true,
    },
    draft: false,
    overrideAccess: true,
  })) as unknown as Product;
  return product.id;
}

async function currentStock(productId: number): Promise<number> {
  const product = await payload.findByID({ collection: 'products', id: productId, overrideAccess: true });
  return Number((product as unknown as Product).currentStock) || 0;
}

async function seedStock(productId: number, quantity: number, unitCostUSD: number): Promise<void> {
  await payload.create({
    collection: 'stock-movements',
    data: {
      reference: `SEED-${RUN}-${productId}`,
      movementType: 'purchase_in',
      product: productId,
      targetWarehouse: warehouseId,
      quantity,
      unitCostUSD,
      totalCostUSD: quantity * unitCostUSD,
      tenant: tenantId,
      reason: 'Semilla de inventario para la prueba',
    },
    draft: false,
    overrideAccess: true,
  });
}

async function movementsFor(invoiceId: number, type: string): Promise<StockMovement[]> {
  const res = await payload.find({
    collection: 'stock-movements',
    where: {
      and: [{ invoice: { equals: invoiceId } }, { movementType: { equals: type } }],
    },
    pagination: false,
    overrideAccess: true,
  });
  return res.docs as StockMovement[];
}

describe('devolución de venta — preserva el costo del reingreso (S4-1)', () => {
  it('la anulación reingresa al costo de la venta original (no en 0)', async () => {
    const unitCost = 5;
    const product = await createProductWithCost(unitCost);
    await seedStock(product, 10, unitCost);

    // Venta de 3 unidades → sale_out valuado al costUSD del producto.
    const invoice = (await payload.create({
      collection: 'invoices',
      data: {
        tenant: tenantId,
        invoiceNumber: `RET-${RUN}-01`,
        customer: customerId,
        dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        issueDate: new Date().toISOString(),
        paymentTerms: 'cash',
        status: 'issued',
        exchangeRateSnapshot: 40,
        totalUSD: 30,
        totalVES: 1200,
        balanceUSD: 30,
        balanceVES: 1200,
        items: [{ product, description: `P ${RUN}`, quantity: 3, unitPriceUSD: 10, totalUSD: 30 }],
      },
      draft: false,
      overrideAccess: true,
    })) as unknown as Invoice;

    const sold = await movementsFor(invoice.id, 'sale_out');
    expect(sold).toHaveLength(1);
    expect(Number(sold[0].unitCostUSD)).toBe(unitCost);
    expect(extractId(sold[0].product)).toBe(product);

    // Anular la factura → el plugin dispara la reversión de inventario.
    await payload.update({
      collection: 'invoices',
      id: invoice.id,
      data: { status: 'voided' },
      draft: false,
      overrideAccess: true,
    });

    const returned = await movementsFor(invoice.id, 'sale_return');
    expect(returned).toHaveLength(1);
    expect(Number(returned[0].quantity)).toBe(3);
    // El reingreso conserva el costo de la venta (antes del fix: 0).
    expect(Number(returned[0].unitCostUSD)).toBe(unitCost);
    expect(Number(returned[0].totalCostUSD)).toBe(15);
  });

  it('la devolución PARCIAL reingresa unidades y no falla (Devin #87)', async () => {
    const unitCost = 5;
    const product = await createProductWithCost(unitCost, '-partial');
    await seedStock(product, 10, unitCost);

    // Venta de 4 unidades → sale_out; quedan 6 en stock.
    const invoice = (await payload.create({
      collection: 'invoices',
      data: {
        tenant: tenantId,
        invoiceNumber: `RET-${RUN}-PARTIAL`,
        customer: customerId,
        dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        issueDate: new Date().toISOString(),
        paymentTerms: 'cash',
        status: 'issued',
        exchangeRateSnapshot: 40,
        totalUSD: 40,
        totalVES: 1600,
        balanceUSD: 40,
        balanceVES: 1600,
        items: [{ product, description: `P parcial ${RUN}`, quantity: 4, unitPriceUSD: 10, totalUSD: 40 }],
      },
      draft: false,
      overrideAccess: true,
    })) as unknown as Invoice;

    expect(await currentStock(product)).toBe(6);

    // Devolución PARCIAL de 1 de las 4 unidades vendidas.
    const transactionID = await payload.db.beginTransaction();
    const req = {
      payload,
      user: userDoc,
      context: {},
      transactionID,
    } as unknown as PayloadRequest;

    try {
      const result = await returnSaleLines({
        invoice,
        lines: [{ productId: product, quantity: 1 }],
        reason: 'Devolución parcial de prueba',
        req,
      });
      if (transactionID) await payload.db.commitTransaction(transactionID);

      // Antes del fix, la query agrupada con `ORDER BY id` lanzaba en PostgreSQL
      // y no se creaba NINGÚN movimiento de devolución.
      expect(result.movementsCreated).toBe(1);
      expect(result.results[0]?.status).toBe('ok');
    } catch (error) {
      if (transactionID) await payload.db.rollbackTransaction(transactionID);
      throw error;
    }

    expect(await currentStock(product)).toBe(7); // 6 + 1

    const returned = await movementsFor(invoice.id, 'sale_return');
    expect(returned).toHaveLength(1);
    expect(Number(returned[0].quantity)).toBe(1);
    expect(Number(returned[0].unitCostUSD)).toBe(unitCost);
  });
});

