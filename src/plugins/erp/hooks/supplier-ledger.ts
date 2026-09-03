import type { PayloadRequest } from 'payload';

export interface RecalculateSupplierBalanceArgs {
  supplierId: string | number;
  req: PayloadRequest;
}

/**
 * Recalcula de forma atómica y segura la deuda acumulada, deuda vencida
 * y fechas del ledger con un proveedor tras mutaciones en Facturas de Compra o Pagos.
 * 
 * Cumple con AGENTS.md:
 * - Threading de `req` para participar en la transacción del request.
 * - Prevención de bucles infinitos con `req.context.skipSupplierBalanceRecalculation`.
 */
export async function recalculateSupplierBalance({
  supplierId,
  req,
}: RecalculateSupplierBalanceArgs): Promise<void> {
  if (!supplierId || req.context?.skipSupplierBalanceRecalculation) {
    return;
  }

  const normalizedSupplierId = typeof supplierId === 'object' && supplierId !== null
    ? (supplierId as { id: string | number }).id
    : supplierId;

  if (!normalizedSupplierId) return;

  const now = new Date();

  // 1. Consultar todas las facturas de compra vigentes con saldo pendiente
  const purchaseInvoicesRes = await req.payload.find({
    collection: 'purchase-invoices',
    where: {
      and: [
        { supplier: { equals: normalizedSupplierId } },
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

  for (const inv of purchaseInvoicesRes.docs) {
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

  // 2. Consultar último pago realizado a este proveedor
  const latestPaymentRes = await req.payload.find({
    collection: 'supplier-payments',
    where: {
      supplier: { equals: normalizedSupplierId },
    },
    sort: '-paymentDate',
    limit: 1,
    depth: 0,
    req,
    overrideAccess: true,
  });

  const lastPaymentDate = latestPaymentRes.docs[0]?.paymentDate || undefined;

  // 3. Actualizar balance en el documento de Suppliers
  await req.payload.update({
    collection: 'suppliers',
    id: normalizedSupplierId,
    data: {
      currentDebtUSD: Math.max(0, Math.round(currentDebtUSD * 100) / 100),
      currentDebtVES: Math.max(0, Math.round(currentDebtVES * 100) / 100),
      overdueDebtUSD: Math.max(0, Math.round(overdueDebtUSD * 100) / 100),
      ...(lastPaymentDate ? { lastPaymentDate } : {}),
    },
    req,
    context: {
      ...req.context,
      skipSupplierBalanceRecalculation: true,
    },
    overrideAccess: true,
  });
}
