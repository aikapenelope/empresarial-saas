import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPayload } from 'payload';
import type { Payload } from 'payload';
import config from '@payload-config';
import type { Customer, Invoice, Product, PurchaseInvoice, StockMovement, Supplier, Warehouse } from '@/payload-types';
import { extractId } from '@/utilities/inventoryLedger';

/**
 * ─── Integración: acoplamiento venta/compra ↔ inventario ────────────────────
 *
 * Ejercita sobre Postgres REAL y el esquema migrado (la suite NO muta el
 * esquema; las migraciones se aplican antes):
 *
 *   compra de semilla → venta MULTI-PRODUCTO (sale_out por producto) →
 *   anulación (sale_return por producto) con currentStock verificado en
 *   cada paso — la regresión que encontró Devin (#55: el flag de contexto
 *   contaminado dejaba el 2º producto sin recalcular).
 *
 * Cobertura de rechazos: venta sin stock suficiente y borrado de factura
 * con kardex publicado (ledger inmutable). Además, recepción de compra
 * multi-línea (purchase_in por línea).
 *
 * Los datos se crean con sufijo único por corrida y quedan en la BD de
 * pruebas (local 54322 / service container de CI) — jamás en Supabase
 * (setupEnv.ts lo bloquea a nivel de proceso).
 */

const RUN = Date.now().toString(36);

let payload: Payload;
let tenantId: number;
let warehouseId: number;
let customerId: number;
let supplierId: number;

beforeAll(async () => {
  payload = await getPayload({ config });

  const tenant = await payload.create({
    collection: 'tenants',
    data: {
      name: `QA Kardex ${RUN}`,
      slug: `qa-kardex-${RUN}`,
      salesConfig: { salesDocumentDefault: 'factura' },
    },
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

  const supplier = await payload.create({
    collection: 'suppliers',
    data: {
      tenant: tenantId,
      name: `Proveedor QA ${RUN}`,
      taxId: `R-${RUN}`,
      currentDebtUSD: 0,
      currentDebtVES: 0,
    },
    draft: false,
    overrideAccess: true,
    // Semilla interna: el hook de Suppliers exige el flag para tocar saldos
    context: { allowInternalDebtUpdate: true },
  }) as unknown as Supplier;
  supplierId = supplier.id;
});

afterAll(async () => {
  // La BD de pruebas persiste entre corridas (es desechable por diseño);
  // aquí solo liberamos la pool de conexiones del proceso de test.
  const db = (payload as unknown as { db?: { destroy?: () => Promise<void> } }).db;
  if (db?.destroy) await db.destroy();
});

async function createPhysicalProduct(name: string): Promise<number> {
  const product = await payload.create({
    collection: 'products',
    data: {
      tenant: tenantId,
      name: `Producto QA ${name}`,
      sku: `QA-${name}-${RUN}`,
      productType: 'standard',
      unitOfMeasure: 'unit',
      costUSD: 5,
      priceUSD: 10,
      taxRate: 'exempt',
      trackInventory: true,
    },
    draft: false,
    overrideAccess: true,
  }) as unknown as Product;
  return product.id;
}

async function seedStock(productId: number, quantity: number, unitCostUSD = 5): Promise<void> {
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

async function currentStock(productId: number): Promise<number> {
  const product = await payload.findByID({ collection: 'products', id: productId, overrideAccess: true });
  return Number((product as unknown as Product).currentStock) || 0;
}

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

function qtyByType(movements: StockMovement[], type: string): Map<number, number> {
  return new Map(
    movements
      .filter((m) => m.movementType === type)
      .map((m) => [Number(extractId(m.product)), Number(m.quantity)]),
  );
}

describe('kardex — inventario multi-producto (regresión Devin #55)', () => {
  it('la compra de semilla (purchase_in) carga existencias por producto', async () => {
    const a = await createPhysicalProduct('seedA');
    await seedStock(a, 10);
    expect(await currentStock(a)).toBe(10);
  });

  it('venta de DOS productos recalcula currentStock de AMBOS y la anulación repone ambos', async () => {
    const prodA = await createPhysicalProduct('ventaA');
    const prodB = await createPhysicalProduct('ventaB');
    await seedStock(prodA, 10);
    await seedStock(prodB, 8);

    const invoice = await payload.create({
      collection: 'invoices',
      data: {
        tenant: tenantId,
        invoiceNumber: `TEST-${RUN}-A2`,
        customer: customerId,
        dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        issueDate: new Date().toISOString(),
        paymentTerms: 'cash',
        status: 'issued',
        exchangeRateSnapshot: 40,
        totalUSD: 70,
        totalVES: 2800,
        balanceUSD: 70,
        balanceVES: 2800,
        items: [
          { product: prodA, description: `Producto A ${RUN}`, quantity: 3, unitPriceUSD: 10, totalUSD: 30 },
          { product: prodB, description: `Producto B ${RUN}`, quantity: 4, unitPriceUSD: 10, totalUSD: 40 },
        ],
      },
      draft: false,
      overrideAccess: true,
    }) as unknown as Invoice;

    const movements = await stockMovementsFor(invoice.id);
    const sales = qtyByType(movements, 'sale_out');
    expect(sales.get(prodA)).toBe(3);
    expect(sales.get(prodB)).toBe(4);
    // La regresión de Devin #55: el 2º producto quedaba sin recálculo
    expect(await currentStock(prodA)).toBe(7);
    expect(await currentStock(prodB)).toBe(4);

    const voided = await payload.update({
      collection: 'invoices',
      id: invoice.id,
      data: { status: 'voided' },
      draft: false,
      overrideAccess: true,
    }) as unknown as Invoice;
    expect(voided.balanceUSD).toBe(0);

    const afterVoid = await stockMovementsFor(invoice.id);
    const returns = qtyByType(afterVoid, 'sale_return');
    expect(returns.get(prodA)).toBe(3);
    expect(returns.get(prodB)).toBe(4);
    expect(await currentStock(prodA)).toBe(10);
    expect(await currentStock(prodB)).toBe(8);
  });

  it('rechaza vender más de lo disponible (stock insuficiente)', async () => {
    const prod = await createPhysicalProduct('neg');
    await seedStock(prod, 2);

    await expect(
      payload.create({
        collection: 'invoices',
        data: {
          tenant: tenantId,
          invoiceNumber: `TEST-${RUN}-NEG`,
          customer: customerId,
          dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
          issueDate: new Date().toISOString(),
          paymentTerms: 'cash',
          status: 'issued',
          exchangeRateSnapshot: 40,
          totalUSD: 500,
          totalVES: 20000,
          balanceUSD: 500,
          balanceVES: 20000,
          items: [
            { product: prod, description: `Producto NEG ${RUN}`, quantity: 99, unitPriceUSD: 10, totalUSD: 990 },
          ],
        },
        draft: false,
        overrideAccess: true,
      }),
    ).rejects.toThrow(/Stock insuficiente/i);
  });

  it('una factura de servicio (sin producto) no genera movimientos de kardex', async () => {
    const invoice = await payload.create({
      collection: 'invoices',
      data: {
        tenant: tenantId,
        invoiceNumber: `TEST-${RUN}-SVC`,
        customer: customerId,
        dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        issueDate: new Date().toISOString(),
        paymentTerms: 'cash',
        status: 'issued',
        exchangeRateSnapshot: 40,
        totalUSD: 100,
        totalVES: 4000,
        balanceUSD: 100,
        balanceVES: 4000,
        items: [{ description: 'Servicio de consultoría QA', quantity: 1, unitPriceUSD: 100, totalUSD: 100 }],
      },
      draft: false,
      overrideAccess: true,
    }) as unknown as Invoice;

    const movements = await stockMovementsFor(invoice.id);
    expect(movements).toHaveLength(0);
  });

  it('bloquea el borrado de una factura con kardex publicado (ledger inmutable)', async () => {
    const prod = await createPhysicalProduct('del');
    await seedStock(prod, 5);

    const invoice = await payload.create({
      collection: 'invoices',
      data: {
        tenant: tenantId,
        invoiceNumber: `TEST-${RUN}-DEL`,
        customer: customerId,
        dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        issueDate: new Date().toISOString(),
        paymentTerms: 'cash',
        status: 'issued',
        exchangeRateSnapshot: 40,
        totalUSD: 10,
        totalVES: 400,
        balanceUSD: 10,
        balanceVES: 400,
        items: [
          { product: prod, description: `Producto DEL ${RUN}`, quantity: 1, unitPriceUSD: 10, totalUSD: 10 },
        ],
      },
      draft: false,
      overrideAccess: true,
    }) as unknown as Invoice;

    await expect(
      payload.delete({ collection: 'invoices', id: invoice.id, overrideAccess: true }),
    ).rejects.toThrow(/Kardex inmutable/i);

    const voided = await payload.update({
      collection: 'invoices',
      id: invoice.id,
      data: { status: 'voided' },
      draft: false,
      overrideAccess: true,
    }) as unknown as Invoice;
    expect(voided.status).toBe('voided');
    expect(await currentStock(prod)).toBe(5);
  });
});

describe('kardex — recepción de compra multi-línea', () => {
  it('recibir una factura de compra de 2 productos carga el stock de AMBOS', async () => {
    const prodP1 = await createPhysicalProduct('compP1');
    const prodP2 = await createPhysicalProduct('compP2');

    const purchase = await payload.create({
      collection: 'purchase-invoices',
      data: {
        tenant: tenantId,
        invoiceNumber: `COMP-${RUN}-01`,
        supplier: supplierId,
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 15 * 24 * 3600 * 1000).toISOString(),
        paymentTerms: 'cash',
        status: 'received',
        receptionStatus: 'received',
        receptionWarehouse: warehouseId,
        receptionDate: new Date().toISOString(),
        exchangeRateSnapshot: 40,
        totalUSD: 23,
        totalVES: 920,
        balanceUSD: 23,
        balanceVES: 920,
        items: [
          { product: prodP1, description: `P1 ${RUN}`, quantity: 4, unitCostUSD: 2, totalUSD: 8 },
          { product: prodP2, description: `P2 ${RUN}`, quantity: 5, unitCostUSD: 3, totalUSD: 15 },
        ],
      },
      draft: false,
      overrideAccess: true,
    }) as unknown as PurchaseInvoice;
    expect(purchase.status).toBe('received');

    // La recepción publica purchase_in por línea (purchasesLedger)
    expect(await currentStock(prodP1)).toBe(4);
    expect(await currentStock(prodP2)).toBe(5);

    // Regresión S40: las lecturas de beforeValidate (con flag
    // skipBalanceRecalculation) contaminaban req.context y saltaban el
    // recálculo de deuda — el proveedor debía quedar con el total recibido.
    const supplierAfter = (await payload.findByID({
      collection: 'suppliers',
      id: supplierId,
      overrideAccess: true,
    })) as unknown as Supplier;
    expect(Number(supplierAfter.currentDebtUSD)).toBe(23);
  });
});
