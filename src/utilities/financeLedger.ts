import type { PayloadRequest } from 'payload';

export interface RecalculateBalanceResult {
  currentDebtUSD: number;
  currentDebtVES: number;
  overdueDebtUSD: number;
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
 * Atomically recalculates and updates a customer's ledger balances (current debt, overdue debt)
 * based on all active, non-voided invoices.
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

  // Find all open/active invoices for this customer
  const invoicesResult = await req.payload.find({
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
    limit: 1000,
    depth: 0,
    req,
    context: {
      ...req.context,
      skipBalanceRecalculation: true,
    },
  });

  const now = new Date();
  now.setHours(23, 59, 59, 999);

  let currentDebtUSD = 0;
  let currentDebtVES = 0;
  let overdueDebtUSD = 0;

  for (const inv of invoicesResult.docs) {
    const balUSD = Number(inv.balanceUSD) || 0;
    const balVES = Number(inv.balanceVES) || 0;

    if (balUSD > 0) {
      currentDebtUSD += balUSD;
      currentDebtVES += balVES;

      if (inv.dueDate) {
        const dueDate = new Date(inv.dueDate);
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

export interface PaymentAllocation {
  invoice: number | string | { id: number | string };
  allocatedAmountUSD: number;
}

/**
 * Applies payment allocations to invoices, updating their balanceUSD, balanceVES, and status.
 */
export async function applyPaymentAllocations(
  allocations: PaymentAllocation[] | undefined | null,
  req: PayloadRequest,
): Promise<void> {
  if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
    return;
  }

  for (const alloc of allocations) {
    const invoiceId = extractId(alloc.invoice);
    const amount = Number(alloc.allocatedAmountUSD) || 0;

    if (!invoiceId || amount <= 0) continue;

    const invoice = await req.payload.findByID({
      collection: 'invoices',
      id: invoiceId,
      depth: 0,
      req,
      context: {
        ...req.context,
        skipBalanceRecalculation: true,
      },
    });

    if (!invoice) continue;

    const currentBalUSD = Number(invoice.balanceUSD) || 0;
    const rate = Number(invoice.exchangeRateSnapshot) || 1;
    const newBalUSD = Math.max(0, Number((currentBalUSD - amount).toFixed(2)));
    const newBalVES = Number((newBalUSD * rate).toFixed(2));

    let newStatus = invoice.status;
    if (newBalUSD <= 0.005) {
      newStatus = 'paid';
    } else if (newBalUSD < (Number(invoice.totalUSD) || 0)) {
      newStatus = 'partially_paid';
    }

    await req.payload.update({
      collection: 'invoices',
      id: invoiceId,
      data: {
        balanceUSD: newBalUSD,
        balanceVES: newBalVES,
        status: newStatus,
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
 * Reverses payment allocations from invoices (restoring previous balanceUSD, balanceVES, and status).
 */
export async function reversePaymentAllocations(
  allocations: PaymentAllocation[] | undefined | null,
  req: PayloadRequest,
): Promise<void> {
  if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
    return;
  }

  for (const alloc of allocations) {
    const invoiceId = extractId(alloc.invoice);
    const amount = Number(alloc.allocatedAmountUSD) || 0;

    if (!invoiceId || amount <= 0) continue;

    const invoice = await req.payload.findByID({
      collection: 'invoices',
      id: invoiceId,
      depth: 0,
      req,
      context: {
        ...req.context,
        skipBalanceRecalculation: true,
      },
    });

    if (!invoice) continue;

    const currentBalUSD = Number(invoice.balanceUSD) || 0;
    const totalUSD = Number(invoice.totalUSD) || 0;
    const rate = Number(invoice.exchangeRateSnapshot) || 1;
    const newBalUSD = Math.min(totalUSD, Number((currentBalUSD + amount).toFixed(2)));
    const newBalVES = Number((newBalUSD * rate).toFixed(2));

    let newStatus = invoice.status;
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
        status: newStatus,
      },
      req,
      context: {
        ...req.context,
        skipBalanceRecalculation: true,
      },
    });
  }
}
