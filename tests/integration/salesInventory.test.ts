import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPayload } from 'payload';
import type { Payload } from 'payload';
import config from '@payload-config';
import type { Customer, Invoice, Product, StockMovement, Warehouse } from '@/payload-types';

/**
 * ─── Integración: acoplamiento venta→inventario (salesInventoryPlugin) ──────
 *
 * Ejercita el ciclo completo del Sprint 7 sobre Postgres REAL y el esquema
 * migrado (la suite NO muta el esquema; las migraciones se aplican antes):
 *
 *   compra de semilla (purchase_in) → factura emitida (sale_out) →
 *   anulación (sale_return) con reposición verificada en `currentStock`.
 *
 * Los datos se crean con sufijo único por corrida y quedan en la BD de
 * pruebas (local 54322 / service container de CI) — jamás en Supabase.
 */

const RUN = Date.now().toString(36);

let payload: Payload;
let tenantId: number;
let warehouseId: number;
let productId: number;
let customerId: number;

beforeAll(async () => {
  payload = await getPayload({ config });

  const tenant = await payload.create({
    collection: 'tenants',
    data: { name: `QA Kardex ${RUN}`, slug: `qa-kardex-${RUN}` },
    overrideAccess: true,
  });
  tenantId = tenant.id;

  const warehouse = await payload.create({
    collection: 'warehouses',
    data: {
      tenant: tenantId,
      name: 'Almacén Principal QA',
      code: `QA-${RUN}`,
      type: 'main',
      isDefault: true,
      isActive: true,
    },
    overrideAccess: true,
  }) as unknown as Warehouse;
  warehouseId = warehouse.id;

  const product = await payload.create({
    collection: 'products',
    data: {
      tenant: tenantId,
      name: `Producto QA ${RUN}`,
      sku: `QA-${RUN}`,
      productType: 'standard',
      unitOfMeasure: 'unit',
      costUSD: 5,
      priceUSD: 10,
      taxRate: 'exempt',
      trackInventory: true,
    },
    overrideAccess: true,
  }) as unknown as Product;
  productId = product.id;

  const customer = await payload.create({
    collection: 'customers',
    data: {
      tenant: tenantId,
      name: `Cliente QA ${RUN}`,
      taxId: `J-${RUN}`,
      phone: '0000000000',
      status: 'lead',
    },
    draft: false,
    overrideAccess: true,
  }) as unknown as Customer;
  customerId = customer.id;
});

afterAll(async () => {
  // La BD de pruebas persiste entre corridas (es desechable por diseño);
  // aquí solo liberamos la pool de conexiones del proceso de test.
  // (payload expone db.destroy en runtime Postgres)
  const db = (payload as unknown as { db?: { destroy?: () => Promise<void> } }).db;
  if (db?.destroy) await db.destroy();
});

async function stockMovementsFor(invoiceId: number): Promise<StockMovement[]> {
  const res = await payload.find({
    collection: 'stock-movements',
    where: { invoice: { equals: invoiceId } },
    limit: 50,
    pagination: false,
    sort: 'createdAt',
    overrideAccess: true,
  });
  return res.docs as StockMovement[];
}

async function currentStock(): Promise<number> {
  const product = await payload.findByID({ collection: 'products', id: productId, overrideAccess: true });
  return Number((product as unknown as Product).currentStock) || 0;
}

describe('salesInventoryPlugin — ciclo venta → kardex → anulación', () => {
  it('la compra de semilla (purchase_in) carga existencias en el almacén', async () => {
    await payload.create({
      collection: 'stock-movements',
      data: {
        reference: `SEED-${RUN}`,
        movementType: 'purchase_in',
        product: productId,
        targetWarehouse: warehouseId,
        quantity: 10,
        unitCostUSD: 5,
        totalCostUSD: 50,
        tenant: tenantId,
        reason: 'Semilla de inventario para la prueba',
      },
      draft: false,
      overrideAccess: true,
    });

    expect(await currentStock()).toBe(10);
  });

  it('emitir factura con producto descarga el kardex (sale_out) y baja currentStock', async () => {
    const invoice = await payload.create({
      collection: 'invoices',
      data: {
        tenant: tenantId,
        invoiceNumber: `TEST-${RUN}-0001`,
        customer: customerId,
        dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        paymentTerms: 'cash',
        status: 'issued',
        exchangeRateSnapshot: 40,
        items: [
          { product: productId, description: `Producto QA ${RUN}`, quantity: 3, unitPriceUSD: 10 },
        ],
        issueDate: new Date().toISOString(),
        totalUSD: 30,
        totalVES: 1200,
        balanceUSD: 30,
        balanceVES: 1200,
      },
      draft: false,
      overrideAccess: true,
    }) as unknown as Invoice;

    // Totales calculados por el beforeValidate del dominio
    expect(invoice.totalUSD).toBe(30);
    expect(invoice.totalVES).toBe(1200);

    const movements = await stockMovementsFor(invoice.id);
    const saleOut = movements.find((m) => m.movementType === 'sale_out');

    expect(saleOut).toBeDefined();
    expect(Number(saleOut?.quantity)).toBe(3);
    expect(extractId(saleOut?.sourceWarehouse)).toBe(warehouseId);
    // El Kardex es inmutable: el costo viaja como snapshot del producto
    expect(Number(saleOut?.unitCostUSD)).toBe(5);

    expect(await currentStock()).toBe(7);

    // Anulación: la factura se revierte con sale_return (la única vía —
    // el borrado con kardex publicado está bloqueado por el plugin)
    const voided = await payload.update({
      collection: 'invoices',
      id: invoice.id,
      data: { status: 'voided' },
      overrideAccess: true,
    }) as unknown as Invoice;
    expect(voided.balanceUSD).toBe(0);

    const afterVoid = await stockMovementsFor(invoice.id);
    const saleReturn = afterVoid.find((m) => m.movementType === 'sale_return');

    expect(saleReturn).toBeDefined();
    expect(Number(saleReturn?.quantity)).toBe(3);
    expect(extractId(saleReturn?.targetWarehouse)).toBe(warehouseId);
    expect(await currentStock()).toBe(10);
  });

  it('bloquea el borrado de una factura con kardex publicado (ledger inmutable)', async () => {
    const invoice = await payload.create({
      collection: 'invoices',
      data: {
        tenant: tenantId,
        invoiceNumber: `TEST-${RUN}-0002`,
        customer: customerId,
        dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        paymentTerms: 'cash',
        status: 'issued',
        exchangeRateSnapshot: 40,
        items: [
          { product: productId, description: `Producto QA ${RUN}`, quantity: 1, unitPriceUSD: 10 },
        ],
        issueDate: new Date().toISOString(),
        totalUSD: 10,
        totalVES: 400,
        balanceUSD: 10,
        balanceVES: 400,
      },
      draft: false,
      overrideAccess: true,
    }) as unknown as Invoice;

    await expect(
      payload.delete({ collection: 'invoices', id: invoice.id, overrideAccess: true }),
    ).rejects.toThrow(/Kardex inmutable/i);

    // La vía correcta sigue siendo anular
    const voided = await payload.update({
      collection: 'invoices',
      id: invoice.id,
      data: { status: 'voided' },
      overrideAccess: true,
    }) as unknown as Invoice;
    expect(voided.status).toBe('voided');
  });

  it('una factura de servicio (sin producto) no genera movimientos de kardex', async () => {
    const invoice = await payload.create({
      collection: 'invoices',
      data: {
        tenant: tenantId,
        invoiceNumber: `TEST-${RUN}-0003`,
        customer: customerId,
        dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        paymentTerms: 'cash',
        status: 'issued',
        exchangeRateSnapshot: 40,
        items: [{ description: 'Servicio de consultoría QA', quantity: 1, unitPriceUSD: 100 }],
        issueDate: new Date().toISOString(),
        totalUSD: 100,
        totalVES: 4000,
        balanceUSD: 100,
        balanceVES: 4000,
      },
      draft: false,
      overrideAccess: true,
    }) as unknown as Invoice;

    const movements = await stockMovementsFor(invoice.id);
    expect(movements).toHaveLength(0);
    expect(await currentStock()).toBe(10);
  });
});

function extractId(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
    return Number((value as { id: number }).id);
  }
  return Number(value) || undefined;
}
