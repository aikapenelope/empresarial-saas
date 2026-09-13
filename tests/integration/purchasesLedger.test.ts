import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPayload } from 'payload';
import type { Payload, PayloadRequest } from 'payload';
import config from '@payload-config';
import type { PurchaseInvoice, Supplier, User } from '@/payload-types';
import {
  getPurchaseInvoicePaidAmount,
  postPurchaseReceptionMovements,
  recalculateSupplierBalance,
} from '@/utilities/purchasesLedger';
import { QUERY_PAGE_SIZE } from '@/utilities/paginatedQuery';

/**
 * ─── Ledger de proveedores (CxP): saldos y recepción (Sprint CI-2) ──────────
 *
 * Cubre el dinero que SALE y el ingreso de mercancía. Invariantes fijados:
 *  - `getPurchaseInvoicePaidAmount` sólo suma allocations CONFIRMADAS,
 *  - `recalculateSupplierBalance` = Σ saldos de facturas de compra abiertas,
 *  - `postPurchaseReceptionMovements` es IDEMPOTENTE (no duplica kardex),
 *  - y la regresión (Sprint CI-2b) del defecto P0 del lado ventas: la rama
 *    `itemsChanged` de `beforeValidatePurchaseInvoice`
 *    (src/collections/PurchaseInvoices/index.ts:267) hace SIEMPRE true el flag
 *    (Payload rellena `data.items` desde el documento original), así que el
 *    saldo de la compra no baja al pagar.
 */

const RUN = Date.now().toString(36);

type Row = Record<string, unknown>;

let payload: Payload;
let tenantId: number;
let supplierId: number;
let warehouseId: number;
let user: User;

beforeAll(async () => {
  payload = await getPayload({ config });

  const tenant = await payload.create({
    collection: 'tenants',
    data: { name: `QA CxP ${RUN}`, slug: `qa-cxp-${RUN}`, salesConfig: { salesDocumentDefault: 'factura' } },
    overrideAccess: true,
  });
  tenantId = tenant.id;

  user = (await payload.create({
    collection: 'users',
    data: { email: `qa-cxp-${RUN}@example.com`, name: 'QA CxP', role: 'tenant-admin', password: 'test-12345678' },
    overrideAccess: true,
  })) as unknown as User;

  const warehouse = await payload.create({
    collection: 'warehouses',
    data: { tenant: tenantId, name: `Almacén CxP ${RUN}`, code: `CXP-${RUN}`, type: 'main', isDefault: true, isActive: true },
    overrideAccess: true,
  });
  warehouseId = warehouse.id;

  const supplier = (await payload.create({
    collection: 'suppliers',
    data: {
      tenant: tenantId,
      name: `Proveedor CxP ${RUN}`,
      taxId: `R-CXP-${RUN}`,
      currentDebtUSD: 0,
      currentDebtVES: 0,
    },
    draft: false,
    overrideAccess: true,
    context: { allowInternalDebtUpdate: true },
  })) as unknown as Supplier;
  supplierId = supplier.id;
});

afterAll(async () => {
  const handle = payload.db as unknown as { destroy?: () => Promise<void> };
  if (handle?.destroy) await handle.destroy();
});

let purchaseSeq = 0;

async function createPurchase({ total }: { total: number }): Promise<PurchaseInvoice> {
  purchaseSeq++;
  return (await payload.create({
    collection: 'purchase-invoices',
    data: {
      tenant: tenantId,
      invoiceNumber: `CXP-${RUN}-${purchaseSeq}`,
      supplier: supplierId,
      issueDate: new Date().toISOString(),
      dueDate: new Date(Date.now() + 15 * 24 * 3600 * 1000).toISOString(),
      paymentTerms: 'credit',
      status: 'received',
      receptionStatus: 'received',
      receptionWarehouse: warehouseId,
      receptionDate: new Date().toISOString(),
      exchangeRateSnapshot: 40,
      totalUSD: total,
      totalVES: total * 40,
      balanceUSD: total,
      balanceVES: total * 40,
      items: [{ description: `Servicio CxP ${RUN}`, quantity: 1, unitCostUSD: total, totalUSD: total }],
    },
    draft: false,
    overrideAccess: true,
  })) as unknown as PurchaseInvoice;
}

let paymentSeq = 0;

async function createSupplierPayment({
  allocations,
  amount,
}: {
  allocations?: Array<{ purchaseInvoice: number; allocatedAmountUSD: number }>;
  amount: number;
}): Promise<Row> {
  paymentSeq++;
  return (await payload.create({
    collection: 'supplier-payments',
    data: {
      tenant: tenantId,
      paymentNumber: `SP-${RUN}-${paymentSeq}`,
      supplier: supplierId,
      paymentDate: new Date().toISOString(),
      status: 'confirmed',
      methods: [{ method: 'transfer_ves', currency: 'USD', amount, exchangeRate: 1 }],
      totalUSD: amount,
      allocations: allocations?.map((a) => ({
        purchaseInvoice: a.purchaseInvoice,
        allocatedAmountUSD: a.allocatedAmountUSD,
      })),
    },
    draft: false,
    overrideAccess: true,
  })) as unknown as Row;
}

async function purchaseById(id: number): Promise<PurchaseInvoice> {
  return (await payload.findByID({
    collection: 'purchase-invoices',
    id,
    depth: 0,
    overrideAccess: true,
  })) as unknown as PurchaseInvoice;
}

async function supplierById(id: number): Promise<Supplier> {
  return (await payload.findByID({
    collection: 'suppliers',
    id,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Supplier;
}

describe('ledger de proveedores — saldos y recepción (CI-2)', () => {
  it('getPurchaseInvoicePaidAmount sólo suma allocations CONFIRMADAS', async () => {
    const purchase = await createPurchase({ total: 100 });
    await createSupplierPayment({ amount: 30, allocations: [{ purchaseInvoice: purchase.id, allocatedAmountUSD: 30 }] });

    const tx = await payload.db.beginTransaction();
    const req = { payload, user, context: {}, transactionID: tx } as unknown as PayloadRequest;
    try {
      expect(await getPurchaseInvoicePaidAmount(purchase.id, req)).toBe(30);
    } finally {
      if (tx) await payload.db.commitTransaction(tx);
    }
  });

  it(
    'getPurchaseInvoicePaidAmount suma TODAS las páginas (más de una página de resultados)',
    async () => {
      // Misma clase de defecto del reporte Devin #94 (🟡) en el lado compras:
      // con un `limit` fijo, al reabrir la compra se descontaba un monto pagado
      // incompleto y la deuda del proveedor volvía a subir.
      const paymentsToCreate = QUERY_PAGE_SIZE + 5;
      const purchase = await createPurchase({ total: paymentsToCreate });

      for (let i = 0; i < paymentsToCreate; i += 1) {
        await createSupplierPayment({
          amount: 1,
          allocations: [{ purchaseInvoice: purchase.id, allocatedAmountUSD: 1 }],
        });
      }

      const tx = await payload.db.beginTransaction();
      const req = { payload, user, context: {}, transactionID: tx } as unknown as PayloadRequest;
      try {
        expect(await getPurchaseInvoicePaidAmount(purchase.id, req)).toBe(paymentsToCreate);
      } finally {
        if (tx) await payload.db.commitTransaction(tx);
      }
    },
    180_000,
  );

  it('recalculateSupplierBalance = Σ saldos abiertos de facturas de compra', async () => {
    const supplier = (await payload.create({
      collection: 'suppliers',
      data: { tenant: tenantId, name: `Prov Saldo ${RUN}`, taxId: `R-SALDO-${RUN}`, currentDebtUSD: 0, currentDebtVES: 0 },
      draft: false,
      overrideAccess: true,
      context: { allowInternalDebtUpdate: true },
    })) as unknown as Supplier;

    // Dos compras del MISMO proveedor (helper usa supplierId; aquí creamos a mano).
    let seq = 0;
    for (const total of [60, 40]) {
      seq++;
      await payload.create({
        collection: 'purchase-invoices',
        data: {
          tenant: tenantId,
          invoiceNumber: `CXP-S-${RUN}-${seq}`,
          supplier: supplier.id,
          issueDate: new Date().toISOString(),
          dueDate: new Date(Date.now() + 15 * 86400000).toISOString(),
          paymentTerms: 'credit',
          status: 'received',
          receptionStatus: 'received',
          receptionWarehouse: warehouseId,
          receptionDate: new Date().toISOString(),
          exchangeRateSnapshot: 40,
          totalUSD: total,
          totalVES: total * 40,
          balanceUSD: total,
          balanceVES: total * 40,
          items: [{ description: 'x', quantity: 1, unitCostUSD: total, totalUSD: total }],
        },
        draft: false,
        overrideAccess: true,
      });
    }

    const tx = await payload.db.beginTransaction();
    const req = { payload, user, context: {}, transactionID: tx } as unknown as PayloadRequest;
    try {
      const result = await recalculateSupplierBalance(supplier.id, req);
      expect(result?.currentDebtUSD).toBe(100);
    } finally {
      if (tx) await payload.db.commitTransaction(tx);
    }

    expect(Number((await supplierById(supplier.id)).currentDebtUSD)).toBe(100);
  });

  // ── Regresión del P0 (CI-2b), lado compras ───────────────────────────────
  it('un pago PARCIAL baja el saldo de la compra', async () => {
    const purchase = await createPurchase({ total: 100 });
    await createSupplierPayment({ amount: 40, allocations: [{ purchaseInvoice: purchase.id, allocatedAmountUSD: 40 }] });

    const after = await purchaseById(purchase.id);
    expect(Number(after.balanceUSD)).toBe(60);
  });

  it('postPurchaseReceptionMovements es IDEMPOTENTE (no duplica el kardex)', async () => {
    const product = (await payload.create({
      collection: 'products',
      data: {
        tenant: tenantId,
        name: `Prod CxP ${RUN}`,
        sku: `CXP-P-${RUN}`,
        productType: 'standard',
        unitOfMeasure: 'unit',
        costUSD: 5,
        priceUSD: 10,
        taxRate: 'exempt',
        trackInventory: true,
      },
      draft: false,
      overrideAccess: true,
    })) as unknown as { id: number };

    const purchase = (await payload.create({
      collection: 'purchase-invoices',
      data: {
        tenant: tenantId,
        invoiceNumber: `CXP-REC-${RUN}`,
        supplier: supplierId,
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 15 * 86400000).toISOString(),
        paymentTerms: 'credit',
        status: 'received',
        receptionStatus: 'received',
        receptionWarehouse: warehouseId,
        receptionDate: new Date().toISOString(),
        exchangeRateSnapshot: 40,
        totalUSD: 20,
        totalVES: 800,
        balanceUSD: 20,
        balanceVES: 800,
        items: [{ product: product.id, description: 'p', quantity: 4, unitCostUSD: 5, totalUSD: 20 }],
      },
      draft: false,
      overrideAccess: true,
    })) as unknown as PurchaseInvoice;

    // La recepción ya publicó el kardex al crear la factura → una segunda
    // publicación debe ser un no-op (idempotencia).
    const tx = await payload.db.beginTransaction();
    const req = { payload, user, context: {}, transactionID: tx } as unknown as PayloadRequest;
    try {
      const created = await postPurchaseReceptionMovements(purchase.id, req);
      expect(created).toBe(0);
    } finally {
      if (tx) await payload.db.commitTransaction(tx);
    }
  });
});

