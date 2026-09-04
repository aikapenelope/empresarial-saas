import type { PayloadRequest } from 'payload';
import { sql } from '@payloadcms/db-postgres';

export interface SupplierRecalculateBalanceResult {
  currentDebtUSD: number;
  currentDebtVES: number;
  overdueDebtUSD: number;
}

export interface SupplierPaymentAllocation {
  purchaseInvoice: number | string | { id: number | string };
  allocatedAmountUSD: number;
}

export interface SupplierAllocationScopeOptions {
  supplierId?: number | string | null;
  tenantId?: number | string | null;
}

/**
 * Extracts a numeric or string ID from a potentially populated relationship field.
 */
export function extractId(value: unknown): number | string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
    return (value as { id: number | string }).id;
  }
  if (typeof value === 'number' || typeof value === 'string') {
    return value;
  }
  return null;
}

/**
 * Extracts all tenant IDs associated with a user, handling primitives and populated objects.
 */
export function getUserTenantIds(user: unknown): Array<number | string> {
  if (!user || typeof user !== 'object') return [];
  const u = user as { tenants?: Array<{ tenant: number | string | { id: number | string } }> };
  if (!Array.isArray(u.tenants)) return [];

  const ids: Array<number | string> = [];
  for (const item of u.tenants) {
    const id = extractId(item.tenant);
    if (id !== null && id !== undefined) {
      ids.push(id);
    }
  }
  return ids;
}

/**
 * Resolves the active database or transaction handle from Payload request.
 */
export function getActiveDb(req: PayloadRequest): {
  execute: (query: unknown) => Promise<{ rows: Array<Record<string, unknown>> }>;
} {
  const dbAdapter = req.payload.db as unknown as {
    sessions?: Record<
      string,
      { db: { execute: (q: unknown) => Promise<{ rows: Array<Record<string, unknown>> }> } }
    >;
    drizzle: { execute: (q: unknown) => Promise<{ rows: Array<Record<string, unknown>> }> };
  };

  if (req.transactionID && dbAdapter.sessions?.[req.transactionID as string]?.db) {
    return dbAdapter.sessions[req.transactionID as string].db;
  }

  return dbAdapter.drizzle;
}

/**
 * Paginates through all open (non-voided, non-paid) purchase invoices for a given supplier.
 */
export async function fetchAllSupplierOpenInvoices(
  supplierIdRaw: unknown,
  req: PayloadRequest,
): Promise<Array<Record<string, unknown>>> {
  const supplierId = extractId(supplierIdRaw);
  if (!supplierId) return [];

  let page = 1;
  const allDocs: Array<Record<string, unknown>> = [];
  let hasNextPage = true;

  while (hasNextPage) {
    const res = await req.payload.find({
      collection: 'purchase-invoices',
      where: {
        and: [
          {
            supplier: {
              equals: supplierId,
            },
          },
          {
            status: {
              in: ['received', 'partially_paid'],
            },
          },
        ],
      },
      limit: 250,
      page,
      depth: 0,
      req,
      context: {
        ...req.context,
        skipBalanceRecalculation: true,
      },
    });

    allDocs.push(...(res.docs as unknown as Array<Record<string, unknown>>));
    hasNextPage = Boolean(res.hasNextPage);
    page++;
  }

  return allDocs;
}

/**
 * Reconstructs the exact total amount paid toward a purchase invoice from durable confirmed payment allocations.
 */
export async function getPurchaseInvoicePaidAmount(
  invoiceIdRaw: unknown,
  req: PayloadRequest,
): Promise<number> {
  const invoiceId = extractId(invoiceIdRaw);
  if (!invoiceId) return 0;

  const payments = await req.payload.find({
    collection: 'supplier-payments',
    where: {
      and: [
        {
          'allocations.purchaseInvoice': {
            equals: invoiceId,
          },
        },
        {
          status: {
            equals: 'confirmed',
          },
        },
      ],
    },
    limit: 500,
    depth: 0,
    req,
    context: {
      ...req.context,
      skipBalanceRecalculation: true,
    },
  });

  let totalPaid = 0;
  for (const pay of payments.docs) {
    if (Array.isArray(pay.allocations)) {
      for (const alloc of pay.allocations) {
        if (String(extractId(alloc.purchaseInvoice)) === String(invoiceId)) {
          totalPaid += Number(alloc.allocatedAmountUSD) || 0;
        }
      }
    }
  }

  return Number(totalPaid.toFixed(2));
}

/**
 * Calculates live overdue commercial debt for a supplier as of the current instant.
 */
export async function computeLiveSupplierOverdueDebt(
  supplierIdRaw: unknown,
  req: PayloadRequest,
): Promise<number> {
  const supplierId = extractId(supplierIdRaw);
  if (!supplierId) return 0;

  const cacheKey = `supplier_overdue_${supplierId}`;
  if (req.context?.[cacheKey] !== undefined) {
    return req.context[cacheKey] as number;
  }

  const invoices = await fetchAllSupplierOpenInvoices(supplierId, req);
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  let overdue = 0;
  for (const inv of invoices) {
    const balUSD = Number(inv.balanceUSD) || 0;
    if (balUSD > 0 && inv.dueDate) {
      const due = new Date(inv.dueDate as string);
      if (due < now) {
        overdue += balUSD;
      }
    }
  }

  const result = Number(overdue.toFixed(2));
  if (req.context) {
    req.context[cacheKey] = result;
  }

  return result;
}

/**
 * Computes supplier aging buckets (0-30 days, 31-60 days, 60+ days) dynamically.
 */
export async function getSupplierAging(
  supplierIdRaw: unknown,
  req: PayloadRequest,
): Promise<{ aging0to30: number; aging31to60: number; aging60Plus: number }> {
  const supplierId = extractId(supplierIdRaw);
  if (!supplierId) {
    return { aging0to30: 0, aging31to60: 0, aging60Plus: 0 };
  }

  const cacheKey = `supplier_aging_${supplierId}`;
  if (req.context?.[cacheKey]) {
    return req.context[cacheKey] as {
      aging0to30: number;
      aging31to60: number;
      aging60Plus: number;
    };
  }

  const invoices = await fetchAllSupplierOpenInvoices(supplierId, req);
  const now = Date.now();
  let aging0to30 = 0;
  let aging31to60 = 0;
  let aging60Plus = 0;

  for (const inv of invoices) {
    const balUSD = Number(inv.balanceUSD) || 0;
    if (balUSD <= 0) continue;

    const baseDateStr = (inv.dueDate || inv.issueDate) as string;
    const baseDate = baseDateStr ? new Date(baseDateStr).getTime() : now;
    const diffDays = Math.max(0, Math.floor((now - baseDate) / (1000 * 60 * 60 * 24)));

    if (diffDays <= 30) {
      aging0to30 += balUSD;
    } else if (diffDays <= 60) {
      aging31to60 += balUSD;
    } else {
      aging60Plus += balUSD;
    }
  }

  const result = {
    aging0to30: Number(aging0to30.toFixed(2)),
    aging31to60: Number(aging31to60.toFixed(2)),
    aging60Plus: Number(aging60Plus.toFixed(2)),
  };

  if (req.context) {
    req.context[cacheKey] = result;
  }

  return result;
}

/**
 * Atomically recalculates and updates a supplier's ledger balances (current debt, overdue debt)
 * across ALL active, non-voided purchase invoices.
 *
 * Acquires a row-level lock (`SELECT ... FOR UPDATE`) in the active transaction to serialize concurrent
 * recalculations on different purchase invoices, preventing mutually stale snapshot overwrites.
 */
export async function recalculateSupplierBalance(
  supplierIdRaw: unknown,
  req: PayloadRequest,
): Promise<SupplierRecalculateBalanceResult | null> {
  const supplierId = extractId(supplierIdRaw);
  if (!supplierId) return null;

  if (req.context?.skipBalanceRecalculation) {
    return null;
  }

  const db = getActiveDb(req);

  // Serialize recalculations per supplier inside the active transaction
  await db.execute(
    sql`SELECT id FROM suppliers WHERE id = ${supplierId} FOR UPDATE`,
  );

  const invoices = await fetchAllSupplierOpenInvoices(supplierId, req);

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  let currentDebtUSD = 0;
  let currentDebtVES = 0;
  let overdueDebtUSD = 0;

  for (const inv of invoices) {
    const balUSD = Number(inv.balanceUSD) || 0;
    const balVES = Number(inv.balanceVES) || 0;

    if (balUSD > 0) {
      currentDebtUSD += balUSD;
      currentDebtVES += balVES;

      if (inv.dueDate) {
        const dueDate = new Date(inv.dueDate as string);
        if (dueDate < now) {
          overdueDebtUSD += balUSD;
        }
      }
    }
  }

  const roundedUSD = Number(currentDebtUSD.toFixed(2));
  const roundedVES = Number(currentDebtVES.toFixed(2));
  const roundedOverdueUSD = Number(overdueDebtUSD.toFixed(2));

  await req.payload.update({
    collection: 'suppliers',
    id: supplierId,
    data: {
      currentDebtUSD: roundedUSD,
      currentDebtVES: roundedVES,
      overdueDebtUSD: roundedOverdueUSD,
    },
    req,
    context: {
      ...req.context,
      skipBalanceRecalculation: true,
      allowInternalDebtUpdate: true,
    },
  });

  return {
    currentDebtUSD: roundedUSD,
    currentDebtVES: roundedVES,
    overdueDebtUSD: roundedOverdueUSD,
  };
}

/**
 * Concurrency-safe, tenant-isolated supplier payment allocation application.
 *
 * Acquires a row-level lock (`SELECT ... FOR UPDATE`) on each purchase invoice in the active transaction,
 * verifies tenant and supplier ownership, validates available balance, and updates invoice balance and status atomically.
 */
export async function applySupplierPaymentAllocations(
  allocations: SupplierPaymentAllocation[] | undefined | null,
  req: PayloadRequest,
  options?: SupplierAllocationScopeOptions,
): Promise<void> {
  if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
    return;
  }

  const db = getActiveDb(req);
  const expectedSupplierId = options?.supplierId ? extractId(options.supplierId) : null;
  const expectedTenantId = options?.tenantId ? extractId(options.tenantId) : null;

  for (const alloc of allocations) {
    const invoiceId = extractId(alloc.purchaseInvoice);
    const amount = Number(alloc.allocatedAmountUSD) || 0;

    if (!invoiceId || amount <= 0) continue;

    // Acquire row-level lock in current transaction to prevent race conditions
    const queryResult = await db.execute(
      sql`SELECT id, tenant_id, supplier_id, balance_u_s_d, total_u_s_d, exchange_rate_snapshot, status FROM purchase_invoices WHERE id = ${invoiceId} FOR UPDATE`,
    );

    const invoiceRow = queryResult.rows?.[0];
    if (!invoiceRow) {
      throw new Error(`La factura de compra con ID ${invoiceId} no existe o no pudo ser bloqueada.`);
    }

    // Enforce multi-tenant boundary
    if (expectedTenantId !== null && expectedTenantId !== undefined) {
      if (invoiceRow.tenant_id !== null && invoiceRow.tenant_id !== undefined) {
        if (String(invoiceRow.tenant_id) !== String(expectedTenantId)) {
          throw new Error(
            `Violación de aislamiento multi-inquilino: La factura de compra ${invoiceId} no pertenece al inquilino del pago.`,
          );
        }
      }
    }

    // Enforce supplier boundary
    if (expectedSupplierId !== null && expectedSupplierId !== undefined) {
      if (String(invoiceRow.supplier_id) !== String(expectedSupplierId)) {
        throw new Error(
          `La factura de compra ${invoiceId} pertenece a otro proveedor y no puede ser imputada en este egreso.`,
        );
      }
    }

    const currentBalUSD = Number(invoiceRow.balance_u_s_d) || 0;
    const rate = Number(invoiceRow.exchange_rate_snapshot) || 1;

    // Invariant validation: prevent over-allocation beyond available balance
    if (amount > currentBalUSD + 0.005) {
      throw new Error(
        `El monto asignado ($${amount.toFixed(2)}) excede el saldo disponible ($${currentBalUSD.toFixed(2)}) de la factura de compra ID ${invoiceId}.`,
      );
    }

    const newBalUSD = Math.max(0, Number((currentBalUSD - amount).toFixed(2)));
    const newBalVES = Number((newBalUSD * rate).toFixed(2));

    let newStatus = invoiceRow.status as string;
    if (newBalUSD <= 0.005) {
      newStatus = 'paid';
    } else if (newBalUSD < (Number(invoiceRow.total_u_s_d) || 0)) {
      newStatus = 'partially_paid';
    }

    await req.payload.update({
      collection: 'purchase-invoices',
      id: invoiceId,
      data: {
        balanceUSD: newBalUSD,
        balanceVES: newBalVES,
        status: newStatus as 'draft' | 'received' | 'partially_paid' | 'paid' | 'voided',
      },
      req,
      context: {
        ...req.context,
        skipBalanceRecalculation: true,
      },
    });
  }
}

/**
 * Concurrency-safe reversal of supplier payment allocations (restores purchase invoice balance and status).
 * Preserves voided state so reversing a payment on a voided purchase invoice never revives it.
 */
export async function reverseSupplierPaymentAllocations(
  allocations: SupplierPaymentAllocation[] | undefined | null,
  req: PayloadRequest,
  options?: SupplierAllocationScopeOptions,
): Promise<void> {
  if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
    return;
  }

  const db = getActiveDb(req);
  const expectedSupplierId = options?.supplierId ? extractId(options.supplierId) : null;
  const expectedTenantId = options?.tenantId ? extractId(options.tenantId) : null;

  for (const alloc of allocations) {
    const invoiceId = extractId(alloc.purchaseInvoice);
    const amount = Number(alloc.allocatedAmountUSD) || 0;

    if (!invoiceId || amount <= 0) continue;

    const queryResult = await db.execute(
      sql`SELECT id, tenant_id, supplier_id, balance_u_s_d, total_u_s_d, exchange_rate_snapshot, status FROM purchase_invoices WHERE id = ${invoiceId} FOR UPDATE`,
    );

    const invoiceRow = queryResult.rows?.[0];
    if (!invoiceRow) continue;

    if (
      expectedTenantId &&
      invoiceRow.tenant_id &&
      String(invoiceRow.tenant_id) !== String(expectedTenantId)
    ) {
      continue;
    }
    if (expectedSupplierId && String(invoiceRow.supplier_id) !== String(expectedSupplierId)) {
      continue;
    }

    if (invoiceRow.status === 'voided') {
      continue;
    }

    const currentBalUSD = Number(invoiceRow.balance_u_s_d) || 0;
    const totalUSD = Number(invoiceRow.total_u_s_d) || 0;
    const rate = Number(invoiceRow.exchange_rate_snapshot) || 1;

    const newBalUSD = Math.min(totalUSD, Number((currentBalUSD + amount).toFixed(2)));
    const newBalVES = Number((newBalUSD * rate).toFixed(2));

    let newStatus = invoiceRow.status as string;
    if (newBalUSD >= totalUSD - 0.005) {
      newStatus = 'received';
    } else if (newBalUSD > 0.005) {
      newStatus = 'partially_paid';
    }

    await req.payload.update({
      collection: 'purchase-invoices',
      id: invoiceId,
      data: {
        balanceUSD: newBalUSD,
        balanceVES: newBalVES,
        status: newStatus as 'draft' | 'received' | 'partially_paid' | 'paid' | 'voided',
      },
      req,
      context: {
        ...req.context,
        skipBalanceRecalculation: true,
      },
    });
  }
}

/**
 * Concurrency-safe, idempotent creation of stock movements upon receiving inventory from a purchase invoice.
 * Generates purchase_in movements for each line item that references a physical product.
 */
export async function postPurchaseReceptionMovements(
  invoiceIdRaw: unknown,
  req: PayloadRequest,
): Promise<number> {
  const invoiceId = extractId(invoiceIdRaw);
  if (!invoiceId) return 0;

  const db = getActiveDb(req);

  // Row lock on purchase invoice
  const lockedRes = await db.execute(
    sql`SELECT id, tenant_id, invoice_number, reception_status, reception_warehouse_id FROM purchase_invoices WHERE id = ${invoiceId} FOR UPDATE`,
  );
  const lockedInv = lockedRes.rows?.[0];
  if (!lockedInv) {
    throw new Error(`La factura de compra ID ${invoiceId} no existe.`);
  }

  // Idempotency check: verify whether stock movements have already been posted for this purchase invoice
  const existingMovements = await db.execute(
    sql`SELECT id FROM stock_movements WHERE purchase_invoice_id = ${invoiceId} LIMIT 1`,
  );
  if (existingMovements.rows && existingMovements.rows.length > 0) {
    return 0; // Already posted
  }

  const invoice = await req.payload.findByID({
    collection: 'purchase-invoices',
    id: invoiceId,
    depth: 1,
    req,
    context: {
      ...req.context,
      skipBalanceRecalculation: true,
      skipInventoryRecalculation: true,
    },
  });

  if (!invoice) {
    throw new Error(`La factura de compra ID ${invoiceId} no existe.`);
  }

  const warehouseId = extractId(invoice.receptionWarehouse);
  if (!warehouseId) {
    throw new Error('Debe especificar un almacén de recepción para ingresar la mercancía comprada.');
  }

  const tenantId = extractId(invoice.tenant);
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  let movementsCreated = 0;

  for (const item of items) {
    const productId = extractId(item.product);
    // Only physical inventory items with product link produce stock movements
    if (!productId) continue;

    const qty = Number(item.quantity) || 0;
    if (qty <= 0) continue;

    const unitCost = Number(item.unitCostUSD) || 0;

    await req.payload.create({
      collection: 'stock-movements',
      data: {
        reference: `COMPRA-${invoice.invoiceNumber}`,
        movementType: 'purchase_in',
        product: productId as number,
        targetWarehouse: warehouseId as number,
        quantity: qty,
        unitCostUSD: unitCost,
        totalCostUSD: Number((qty * unitCost).toFixed(2)),
        purchaseInvoice: invoiceId as number,
        tenant: tenantId as number,
        reason: `Recepción de compra según factura ${invoice.invoiceNumber}`,
      },
      req,
      context: {
        ...req.context,
        allowInternalStockUpdate: true,
        allowInternalCostUpdate: true,
      },
    });

    movementsCreated++;
  }

  return movementsCreated;
}
