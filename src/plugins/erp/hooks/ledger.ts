import type { PayloadRequest } from 'payload';

export interface RecalculateBalanceArgs {
  customerId: string | number;
  req: PayloadRequest;
}

/**
 * Recalcula de forma atómica y segura el saldo deudor, deuda vencida
 * y fechas del ledger de un cliente tras mutaciones en Facturas o Cobranzas.
 * 
 * Cumple con AGENTS.md:
 * - Threading de `req` para participar en la transacción del request.
 * - Prevención de bucles infinitos con `req.context.skipBalanceRecalculation`.
 */
export async function recalculateCustomerBalance({
  customerId,
  req,
}: RecalculateBalanceArgs): Promise<void> {
  if (!customerId || req.context?.skipBalanceRecalculation) {
    return;
  }

  const normalizedCustomerId = typeof customerId === 'object' && customerId !== null
    ? (customerId as { id: string | number }).id
    : customerId;

  if (!normalizedCustomerId) return;

  const now = new Date();

  // 1. Consultar todas las facturas vigentes del cliente
  const invoicesRes = await req.payload.find({
    collection: 'invoices',
    where: {
      and: [
        { customer: { equals: normalizedCustomerId } },
        { status: { not_equals: 'cancelled' } },
      ],
    },
    limit: 1000,
    depth: 0,
    req,
    overrideAccess: true,
  });

  let currentDebtUSD = 0;
  let currentDebtVES = 0;
  let overdueDebtUSD = 0;

  for (const inv of invoicesRes.docs) {
    const balUSD = Number(inv.balanceUSD) || 0;
    const balVES = Number(inv.balanceVES) || 0;

    currentDebtUSD += balUSD;
    currentDebtVES += balVES;

    if (balUSD > 0 && inv.dueDate) {
      const due = new Date(inv.dueDate);
      if (due < now) {
        overdueDebtUSD += balUSD;
      }
    }
  }

  // 2. Consultar último pago registrado para timestamp del cliente
  const latestPaymentRes = await req.payload.find({
    collection: 'customer-payments',
    where: {
      customer: { equals: normalizedCustomerId },
    },
    sort: '-paymentDate',
    limit: 1,
    depth: 0,
    req,
    overrideAccess: true,
  });

  const lastPaymentDate = latestPaymentRes.docs[0]?.paymentDate || undefined;

  // 3. Actualizar balance en el documento de Customer
  await req.payload.update({
    collection: 'customers',
    id: normalizedCustomerId,
    data: {
      currentDebtUSD: Math.max(0, Math.round(currentDebtUSD * 100) / 100),
      currentDebtVES: Math.max(0, Math.round(currentDebtVES * 100) / 100),
      overdueDebtUSD: Math.max(0, Math.round(overdueDebtUSD * 100) / 100),
      ...(lastPaymentDate ? { lastPaymentDate } : {}),
    },
    req,
    context: {
      ...req.context,
      skipBalanceRecalculation: true,
    },
    overrideAccess: true,
  });
}
