import type { PayloadRequest } from 'payload';
import { sql } from '@payloadcms/db-postgres';

export interface RecalculateBalanceResult {
  currentDebtUSD: number;
  currentDebtVES: number;
  overdueDebtUSD: number;
}

export interface PaymentAllocation {
  invoice: number | string | { id: number | string };
  allocatedAmountUSD: number;
}

export interface AllocationScopeOptions {
  customerId?: number | string | null;
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
 * Paginates through all open (non-voided, non-paid) invoices for a given customer,
 * ensuring ledger balances, aging buckets, and statements never truncate large customer accounts.
 */
export async function fetchAllCustomerOpenInvoices(
  customerIdRaw: unknown,
  req: PayloadRequest,
): Promise<Array<Record<string, unknown>>> {
  const customerId = extractId(customerIdRaw);
  if (!customerId) return [];

  let page = 1;
  const allDocs: Array<Record<string, unknown>> = [];
  let hasNextPage = true;

  while (hasNextPage) {
    const res = await req.payload.find({
      collection: 'invoices',
      where: {
        and: [
          {
            customer: {
              equals: customerId,
            },
          },
          {
            status: {
              in: ['issued', 'partially_paid'],
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
 * Atomically recalculates and updates a customer's ledger balances (current debt, overdue debt)
 * across ALL active, non-voided invoices without artificial cutoffs.
 *
 * Participates in the caller's transaction via `req`.
 * Uses `req.context.skipBalanceRecalculation` to prevent infinite hook loops.
 */
export async function recalculateCustomerBalance(
  customerIdRaw: unknown,
  req: PayloadRequest,
): Promise<RecalculateBalanceResult | null> {
  const customerId = extractId(customerIdRaw);
  if (!customerId) return null;

  if (req.context?.skipBalanceRecalculation) {
    return null;
  }

  const invoices = await fetchAllCustomerOpenInvoices(customerId, req);

  // Invoices become overdue strictly AFTER their due date has passed (beginning of today)
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
    collection: 'customers',
    id: customerId,
    data: {
      currentDebtUSD: roundedUSD,
      currentDebtVES: roundedVES,
      overdueDebtUSD: roundedOverdueUSD,
    },
    req,
    context: {
      ...req.context,
      skipBalanceRecalculation: true,
    },
  });

  return {
    currentDebtUSD: roundedUSD,
    currentDebtVES: roundedVES,
    overdueDebtUSD: roundedOverdueUSD,
  };
}

/**
 * Resolves the active database or transaction handle from Payload request.
 */
function getActiveDb(req: PayloadRequest): {
  execute: (query: unknown) => Promise<{ rows: Array<Record<string, unknown>> }>;
} {
  const dbAdapter = req.payload.db as unknown as {
    sessions?: Record<string, { db: { execute: (q: unknown) => Promise<{ rows: Array<Record<string, unknown>> }> } }>;
    drizzle: { execute: (q: unknown) => Promise<{ rows: Array<Record<string, unknown>> }> };
  };

  if (req.transactionID && dbAdapter.sessions?.[req.transactionID as string]?.db) {
    return dbAdapter.sessions[req.transactionID as string].db;
  }

  return dbAdapter.drizzle;
}

/**
 * Concurrency-safe, tenant-isolated payment allocation application.
 *
 * Acquires a row-level lock (`SELECT ... FOR UPDATE`) in the active transaction,
 * verifies tenant and customer ownership, validates available balance,
 * and updates invoice balance and status atomically.
 */
export async function applyPaymentAllocations(
  allocations: PaymentAllocation[] | undefined | null,
  req: PayloadRequest,
  options?: AllocationScopeOptions,
): Promise<void> {
  if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
    return;
  }

  const db = getActiveDb(req);
  const expectedCustomerId = options?.customerId ? extractId(options.customerId) : null;
  const expectedTenantId = options?.tenantId ? extractId(options.tenantId) : null;

  for (const alloc of allocations) {
    const invoiceId = extractId(alloc.invoice);
    const amount = Number(alloc.allocatedAmountUSD) || 0;

    if (!invoiceId || amount <= 0) continue;

    // Acquire row-level lock in current transaction to prevent race conditions
    const queryResult = await db.execute(
      sql`SELECT id, tenant_id, customer_id, balance_u_s_d, total_u_s_d, exchange_rate_snapshot, status FROM invoices WHERE id = ${invoiceId} FOR UPDATE`,
    );

    const invoiceRow = queryResult.rows?.[0];
    if (!invoiceRow) {
      throw new Error(`La factura con ID ${invoiceId} no existe o no pudo ser bloqueada.`);
    }

    // Enforce multi-tenant boundary
    if (expectedTenantId !== null && expectedTenantId !== undefined) {
      if (invoiceRow.tenant_id !== null && invoiceRow.tenant_id !== undefined) {
        if (String(invoiceRow.tenant_id) !== String(expectedTenantId)) {
          throw new Error(
            `Violación de aislamiento multi-inquilino: La factura ${invoiceId} no pertenece al inquilino del pago.`,
          );
        }
      }
    }

    // Enforce customer boundary
    if (expectedCustomerId !== null && expectedCustomerId !== undefined) {
      if (String(invoiceRow.customer_id) !== String(expectedCustomerId)) {
        throw new Error(
          `La factura ${invoiceId} pertenece a otro cliente y no puede ser imputada en este cobro.`,
        );
      }
    }

    const currentBalUSD = Number(invoiceRow.balance_u_s_d) || 0;
    const rate = Number(invoiceRow.exchange_rate_snapshot) || 1;

    // Invariant validation: prevent over-allocation beyond available balance
    if (amount > currentBalUSD + 0.005) {
      throw new Error(
        `El monto asignado ($${amount.toFixed(2)}) excede el saldo disponible ($${currentBalUSD.toFixed(2)}) de la factura ID ${invoiceId}.`,
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
      collection: 'invoices',
      id: invoiceId,
      data: {
        balanceUSD: newBalUSD,
        balanceVES: newBalVES,
        status: newStatus as 'draft' | 'issued' | 'partially_paid' | 'paid' | 'voided',
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
 * Concurrency-safe reversal of payment allocations (restores invoice balance and status).
 */
export async function reversePaymentAllocations(
  allocations: PaymentAllocation[] | undefined | null,
  req: PayloadRequest,
  options?: AllocationScopeOptions,
): Promise<void> {
  if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
    return;
  }

  const db = getActiveDb(req);
  const expectedCustomerId = options?.customerId ? extractId(options.customerId) : null;
  const expectedTenantId = options?.tenantId ? extractId(options.tenantId) : null;

  for (const alloc of allocations) {
    const invoiceId = extractId(alloc.invoice);
    const amount = Number(alloc.allocatedAmountUSD) || 0;

    if (!invoiceId || amount <= 0) continue;

    const queryResult = await db.execute(
      sql`SELECT id, tenant_id, customer_id, balance_u_s_d, total_u_s_d, exchange_rate_snapshot, status FROM invoices WHERE id = ${invoiceId} FOR UPDATE`,
    );

    const invoiceRow = queryResult.rows?.[0];
    if (!invoiceRow) continue;

    // Validate tenant & customer match if provided
    if (expectedTenantId && invoiceRow.tenant_id && String(invoiceRow.tenant_id) !== String(expectedTenantId)) {
      continue;
    }
    if (expectedCustomerId && String(invoiceRow.customer_id) !== String(expectedCustomerId)) {
      continue;
    }

    const currentBalUSD = Number(invoiceRow.balance_u_s_d) || 0;
    const totalUSD = Number(invoiceRow.total_u_s_d) || 0;
    const rate = Number(invoiceRow.exchange_rate_snapshot) || 1;

    const newBalUSD = Math.min(totalUSD, Number((currentBalUSD + amount).toFixed(2)));
    const newBalVES = Number((newBalUSD * rate).toFixed(2));

    let newStatus = invoiceRow.status as string;
    if (newBalUSD >= totalUSD - 0.005) {
      newStatus = 'issued';
    } else if (newBalUSD > 0.005) {
      newStatus = 'partially_paid';
    }

    await req.payload.update({
      collection: 'invoices',
      id: invoiceId,
      data: {
        balanceUSD: newBalUSD,
        balanceVES: newBalVES,
        status: newStatus as 'draft' | 'issued' | 'partially_paid' | 'paid' | 'voided',
      },
      req,
      context: {
        ...req.context,
        skipBalanceRecalculation: true,
      },
    });
  }
}
