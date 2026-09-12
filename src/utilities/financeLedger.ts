import type { PayloadRequest } from 'payload';
import { sql } from '@payloadcms/db-postgres';
import { runIsolatedContext } from './requestContext';

// Sprint R6: helpers de acceso a Payload/BD compartidos (antes duplicados aquí,
// en purchasesLedger y cashLedger). El hogar canónico es inventoryLedger; se
// importan para uso local y se re-exportan para los importadores del módulo.
import { extractId, getActiveDb } from './inventoryLedger';
export { extractId, getActiveDb };

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
      // `sort: 'id'` es OBLIGATORIO con paginación por offset: garantiza un orden
      // único y estable entre páginas (con el orden por defecto, los empates de
      // timestamp pueden repetir una fila en una página y omitirla en otra →
      // saldo/antigüedad incorrectos). Misma clase de bug que reportó Devin en
      // #88 (cashLedger.fetchAllShiftDocs); mismo patrón que
      // `dashboardData.findAllMatching`.
      sort: 'id',
      depth: 0,
      req,
    });

    allDocs.push(...(res.docs as unknown as Array<Record<string, unknown>>));
    hasNextPage = Boolean(res.hasNextPage);
    page++;
  }

  return allDocs;
}

/**
 * Reconstructs the exact total amount paid toward an invoice from durable confirmed payment allocations.
 */
export async function getInvoicePaidAmount(
  invoiceIdRaw: unknown,
  req: PayloadRequest,
): Promise<number> {
  const invoiceId = extractId(invoiceIdRaw);
  if (!invoiceId) return 0;

  const payments = await req.payload.find({
    collection: 'customer-payments',
    where: {
      and: [
        {
          'allocations.invoice': {
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
  });

  let totalPaid = 0;
  for (const pay of payments.docs) {
    if (Array.isArray(pay.allocations)) {
      for (const alloc of pay.allocations) {
        if (String(extractId(alloc.invoice)) === String(invoiceId)) {
          totalPaid += Number(alloc.allocatedAmountUSD) || 0;
        }
      }
    }
  }

  return Number(totalPaid.toFixed(2));
}

/**
 * Calculates live overdue debt for a customer as of the current instant.
 * Caches on req.context to optimize multi-field reads within the same request.
 */
export async function computeLiveCustomerOverdueDebt(
  customerIdRaw: unknown,
  req: PayloadRequest,
): Promise<number> {
  const customerId = extractId(customerIdRaw);
  if (!customerId) return 0;

  const cacheKey = `customer_overdue_${customerId}`;
  if (req.context?.[cacheKey] !== undefined) {
    return req.context[cacheKey] as number;
  }

  const invoices = await fetchAllCustomerOpenInvoices(customerId, req);
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
 * Atomically recalculates and updates a customer's ledger balances (current debt, overdue debt)
 * across ALL active, non-voided invoices without artificial cutoffs.
 *
 * Locks the customer row (`SELECT ... FOR UPDATE`) in the active transaction to serialize concurrent
 * calculations on different invoices, preventing mutually stale snapshot overwrites.
 *
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

  const db = getActiveDb(req);

  // Serialize recalculations per customer inside the active transaction
  await db.execute(
    sql`SELECT id FROM customers WHERE id = ${customerId} FOR UPDATE`,
  );

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

  await runIsolatedContext(req, () =>
  req.payload.update({
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
  }),
  );

  return {
    currentDebtUSD: roundedUSD,
    currentDebtVES: roundedVES,
    overdueDebtUSD: roundedOverdueUSD,
  };
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

    await runIsolatedContext(req, () =>
    req.payload.update({
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
    }),
    );
  }
}

/**
 * Concurrency-safe reversal of payment allocations (restores invoice balance and status).
 * Preserves cancellation state so reversing a payment on a voided invoice never revives it.
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
    if (
      expectedTenantId &&
      invoiceRow.tenant_id &&
      String(invoiceRow.tenant_id) !== String(expectedTenantId)
    ) {
      continue;
    }
    if (expectedCustomerId && String(invoiceRow.customer_id) !== String(expectedCustomerId)) {
      continue;
    }

    // Preserve cancellation state: reversing a payment on a voided invoice must never revive it
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
      newStatus = 'issued';
    } else if (newBalUSD > 0.005) {
      newStatus = 'partially_paid';
    }

    await runIsolatedContext(req, () =>
    req.payload.update({
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
    }),
    );
  }
}
