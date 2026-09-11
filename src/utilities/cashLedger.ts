import type { PayloadRequest, Where } from 'payload';
import { runIsolatedContext } from './requestContext';

export interface ShiftMethodTotals {
  cashUSD: number;
  cashVES: number;
  posVES: number;
  pagoMovilVES: number;
  transferVES: number;
  zelleUSD: number;
  binanceUSD: number;
}

export interface ShiftDisbursementsTotals {
  cashUSDOut: number;
  cashVESOut: number;
  posVESOut: number;
  pagoMovilVESOut: number;
  transferVESOut: number;
  zelleUSDOut: number;
  binanceUSDOut: number;
}

export interface ShiftExpectedTotals {
  expectedCashUSD: number;
  expectedCashVES: number;
  expectedPosVES: number;
  expectedPagoMovilVES: number;
  expectedTransferVES: number;
  expectedZelleUSD: number;
  expectedBinanceUSD: number;
  netTotalUSD: number;
}

export interface ShiftSystemTotals {
  collections: ShiftMethodTotals & { totalCollectionsUSD: number };
  disbursements: ShiftDisbursementsTotals & { totalDisbursementsUSD: number };
  expected: ShiftExpectedTotals;
}

export interface ShiftDifferences {
  diffCashUSD: number;
  diffCashVES: number;
  diffPosVES: number;
  diffPagoMovilVES: number;
  diffTransferVES: number;
  diffZelleUSD: number;
  diffBinanceUSD: number;
  totalDiscrepancyUSD: number;
  hasDiscrepancy: boolean;
}

export interface OpeningFloatInput {
  cashUSD?: number | null;
  cashVES?: number | null;
}

export interface DeclaredTotalsInput {
  cashUSD?: number | null;
  cashVES?: number | null;
  posVES?: number | null;
  pagoMovilVES?: number | null;
  transferVES?: number | null;
  zelleUSD?: number | null;
  binanceUSD?: number | null;
}

/**
 * Redondeo financiero estricto a 2 decimales para mitigar errores de coma flotante IEEE-754.
 */
export function round2(val: number): number {
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

/**
 * Extrae un ID normalizado (número o string) de una relación posiblemente poblada.
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
 * Tamaño de página del barrido de movimientos del turno.
 */
const SHIFT_QUERY_PAGE_SIZE = 100;

/**
 * Recorre TODAS las páginas de una query de la Local API. Un `limit` fijo (p. ej.
 * 1000) trunca el resultado en SILENCIO: un turno con más cobros/pagos que el
 * límite calculaba el esperado sobre datos parciales → descuadre falso. Hallazgo
 * S2-2. Mismo patrón paginado que `fetchAllCustomerOpenInvoices` de financeLedger.
 */
async function fetchAllShiftDocs(
  req: PayloadRequest,
  collection: 'customer-payments' | 'supplier-payments',
  where: Where,
): Promise<Array<Record<string, unknown>>> {
  const all: Array<Record<string, unknown>> = [];
  let page = 1;
  let hasNextPage = true;
  while (hasNextPage) {
    const res = await req.payload.find({
      collection,
      where,
      limit: SHIFT_QUERY_PAGE_SIZE,
      page,
      depth: 0,
      req,
    });
    all.push(...(res.docs as unknown as Array<Record<string, unknown>>));
    hasNextPage = Boolean(res.hasNextPage);
    page += 1;
  }
  return all;
}

/**
 * Consulta y consolida todas las transacciones operativas (cobranzas a clientes y egresos a proveedores)
 * ejecutadas durante la sesión de turno de una caja registradora.
 */
export async function computeShiftTransactions({
  closureId,
  cashRegisterId,
  tenantId,
  openedAt,
  closedAt,
  openingFloat,
  req,
}: {
  closureId?: number | string | null;
  cashRegisterId: number | string;
  tenantId?: number | string | null;
  openedAt: string;
  closedAt?: string | null;
  openingFloat?: OpeningFloatInput;
  req: PayloadRequest;
}): Promise<ShiftSystemTotals> {
  const normClosureId = extractId(closureId);
  const normRegisterId = extractId(cashRegisterId);
  const normTenantId = extractId(tenantId);
  const effectiveCloseTime = closedAt || new Date().toISOString();

  // --- 1. Consultar Cobranzas de Clientes (CustomerPayments) ---
  const customerAndConditions: Where[] = [{ status: { equals: 'confirmed' } }];

  if (normTenantId) {
    customerAndConditions.push({ tenant: { equals: normTenantId } });
  }

  const customerOrConditions: Where[] = [];
  if (normClosureId) {
    customerOrConditions.push({ cashClosure: { equals: normClosureId } });
  }
  if (normRegisterId) {
    customerOrConditions.push({
      and: [
        { cashRegister: { equals: normRegisterId } },
        { paymentDate: { greater_than_equal: openedAt } },
        { paymentDate: { less_than_equal: effectiveCloseTime } },
      ],
    });
  }

  if (customerOrConditions.length === 1) {
    customerAndConditions.push(customerOrConditions[0]);
  } else if (customerOrConditions.length > 1) {
    customerAndConditions.push({ or: customerOrConditions });
  }

  const customerPaymentsWhere: Where = {
    and: customerAndConditions,
  };

  const customerPaymentsDocs = await fetchAllShiftDocs(req, 'customer-payments', customerPaymentsWhere);

  const collections: ShiftMethodTotals & { totalCollectionsUSD: number } = {
    cashUSD: 0,
    cashVES: 0,
    posVES: 0,
    pagoMovilVES: 0,
    transferVES: 0,
    zelleUSD: 0,
    binanceUSD: 0,
    totalCollectionsUSD: 0,
  };

  for (const doc of customerPaymentsDocs) {
    const payment = doc as unknown as {
      totalUSD?: number;
      methods?: Array<{
        method?: string;
        currency?: string;
        amount?: number;
        amountUSD?: number;
      }>;
    };

    const paymentTotalUSD = Number(payment.totalUSD) || 0;
    collections.totalCollectionsUSD = round2(collections.totalCollectionsUSD + paymentTotalUSD);

    if (Array.isArray(payment.methods)) {
      for (const m of payment.methods) {
        const amt = Number(m.amount) || 0;
        switch (m.method) {
          case 'cash_usd':
            collections.cashUSD = round2(collections.cashUSD + amt);
            break;
          case 'cash_ves':
            collections.cashVES = round2(collections.cashVES + amt);
            break;
          case 'pos_ves':
            collections.posVES = round2(collections.posVES + amt);
            break;
          case 'pago_movil':
            collections.pagoMovilVES = round2(collections.pagoMovilVES + amt);
            break;
          case 'transfer_ves':
            collections.transferVES = round2(collections.transferVES + amt);
            break;
          case 'zelle':
            collections.zelleUSD = round2(collections.zelleUSD + amt);
            break;
          case 'binance':
            collections.binanceUSD = round2(collections.binanceUSD + amt);
            break;
        }
      }
    }
  }

  // --- 2. Consultar Egresos a Proveedores / Caja Chica (SupplierPayments) ---
  const supplierAndConditions: Where[] = [{ status: { equals: 'confirmed' } }];

  if (normTenantId) {
    supplierAndConditions.push({ tenant: { equals: normTenantId } });
  }

  const supplierOrConditions: Where[] = [];
  if (normClosureId) {
    supplierOrConditions.push({ cashClosure: { equals: normClosureId } });
  }
  if (normRegisterId) {
    supplierOrConditions.push({
      and: [
        { cashRegister: { equals: normRegisterId } },
        { paymentDate: { greater_than_equal: openedAt } },
        { paymentDate: { less_than_equal: effectiveCloseTime } },
      ],
    });
  }

  if (supplierOrConditions.length === 1) {
    supplierAndConditions.push(supplierOrConditions[0]);
  } else if (supplierOrConditions.length > 1) {
    supplierAndConditions.push({ or: supplierOrConditions });
  }

  const supplierPaymentsWhere: Where = {
    and: supplierAndConditions,
  };

  const supplierPaymentsDocs = await fetchAllShiftDocs(req, 'supplier-payments', supplierPaymentsWhere);

  const disbursements: ShiftDisbursementsTotals & { totalDisbursementsUSD: number } = {
    cashUSDOut: 0,
    cashVESOut: 0,
    posVESOut: 0,
    pagoMovilVESOut: 0,
    transferVESOut: 0,
    zelleUSDOut: 0,
    binanceUSDOut: 0,
    totalDisbursementsUSD: 0,
  };

  for (const doc of supplierPaymentsDocs) {
    const payment = doc as unknown as {
      totalUSD?: number;
      methods?: Array<{
        method?: string;
        currency?: string;
        amount?: number;
        amountUSD?: number;
      }>;
    };

    const paymentTotalUSD = Number(payment.totalUSD) || 0;
    disbursements.totalDisbursementsUSD = round2(
      disbursements.totalDisbursementsUSD + paymentTotalUSD,
    );

    if (Array.isArray(payment.methods)) {
      for (const m of payment.methods) {
        const amt = Number(m.amount) || 0;
        switch (m.method) {
          case 'cash_usd':
            disbursements.cashUSDOut = round2(disbursements.cashUSDOut + amt);
            break;
          case 'cash_ves':
            disbursements.cashVESOut = round2(disbursements.cashVESOut + amt);
            break;
          case 'pos_ves':
            disbursements.posVESOut = round2(disbursements.posVESOut + amt);
            break;
          case 'pago_movil':
            disbursements.pagoMovilVESOut = round2(disbursements.pagoMovilVESOut + amt);
            break;
          case 'transfer_ves':
            disbursements.transferVESOut = round2(disbursements.transferVESOut + amt);
            break;
          case 'zelle':
            disbursements.zelleUSDOut = round2(disbursements.zelleUSDOut + amt);
            break;
          case 'binance':
            disbursements.binanceUSDOut = round2(disbursements.binanceUSDOut + amt);
            break;
        }
      }
    }
  }

  // --- 3. Calcular Valores Esperados en Caja ---
  const floatUSD = Number(openingFloat?.cashUSD) || 0;
  const floatVES = Number(openingFloat?.cashVES) || 0;

  const expected: ShiftExpectedTotals = {
    expectedCashUSD: round2(floatUSD + collections.cashUSD - disbursements.cashUSDOut),
    expectedCashVES: round2(floatVES + collections.cashVES - disbursements.cashVESOut),
    expectedPosVES: round2(collections.posVES - disbursements.posVESOut),
    expectedPagoMovilVES: round2(collections.pagoMovilVES - disbursements.pagoMovilVESOut),
    expectedTransferVES: round2(collections.transferVES - disbursements.transferVESOut),
    expectedZelleUSD: round2(collections.zelleUSD - disbursements.zelleUSDOut),
    expectedBinanceUSD: round2(collections.binanceUSD - disbursements.binanceUSDOut),
    netTotalUSD: round2(collections.totalCollectionsUSD - disbursements.totalDisbursementsUSD),
  };

  return {
    collections,
    disbursements,
    expected,
  };
}

/**
 * Compara los montos declarados por el cajero en el arqueo ciego contra los valores
 * esperados computados por el sistema, determinando con precisión sobrantes (+) o faltantes (-).
 */
export function calculateShiftDifferences({
  declaredTotals,
  expected,
  exchangeRate = 1,
}: {
  declaredTotals: DeclaredTotalsInput;
  expected: ShiftExpectedTotals;
  exchangeRate?: number;
}): ShiftDifferences {
  const declCashUSD = Number(declaredTotals?.cashUSD) || 0;
  const declCashVES = Number(declaredTotals?.cashVES) || 0;
  const declPosVES = Number(declaredTotals?.posVES) || 0;
  const declPagoMovil = Number(declaredTotals?.pagoMovilVES) || 0;
  const declTransfer = Number(declaredTotals?.transferVES) || 0;
  const declZelle = Number(declaredTotals?.zelleUSD) || 0;
  const declBinance = Number(declaredTotals?.binanceUSD) || 0;

  const diffCashUSD = round2(declCashUSD - expected.expectedCashUSD);
  const diffCashVES = round2(declCashVES - expected.expectedCashVES);
  const diffPosVES = round2(declPosVES - expected.expectedPosVES);
  const diffPagoMovilVES = round2(declPagoMovil - expected.expectedPagoMovilVES);
  const diffTransferVES = round2(declTransfer - expected.expectedTransferVES);
  const diffZelleUSD = round2(declZelle - expected.expectedZelleUSD);
  const diffBinanceUSD = round2(declBinance - expected.expectedBinanceUSD);

  const effRate = exchangeRate > 0 ? exchangeRate : 1;

  // Convertir diferencias en VES a su equivalente en USD
  const vesDifferencesUSD = round2(
    (diffCashVES + diffPosVES + diffPagoMovilVES + diffTransferVES) / effRate,
  );
  const usdDifferencesUSD = round2(diffCashUSD + diffZelleUSD + diffBinanceUSD);
  const totalDiscrepancyUSD = round2(usdDifferencesUSD + vesDifferencesUSD);

  // Considerar descuadre si cualquier diferencia supera 1 centavo
  const hasDiscrepancy =
    Math.abs(diffCashUSD) > 0.009 ||
    Math.abs(diffCashVES) > 0.009 ||
    Math.abs(diffPosVES) > 0.009 ||
    Math.abs(diffPagoMovilVES) > 0.009 ||
    Math.abs(diffTransferVES) > 0.009 ||
    Math.abs(diffZelleUSD) > 0.009 ||
    Math.abs(diffBinanceUSD) > 0.009;

  return {
    diffCashUSD,
    diffCashVES,
    diffPosVES,
    diffPagoMovilVES,
    diffTransferVES,
    diffZelleUSD,
    diffBinanceUSD,
    totalDiscrepancyUSD,
    hasDiscrepancy,
  };
}

/**
 * Valida que una caja registradora no tenga otra sesión de turno abierta simultáneamente.
 */
export async function assertNoOpenShiftForRegister({
  cashRegisterId,
  currentClosureId,
  req,
}: {
  cashRegisterId: number | string;
  currentClosureId?: number | string | null;
  req: PayloadRequest;
}): Promise<void> {
  const normRegisterId = extractId(cashRegisterId);
  const normClosureId = extractId(currentClosureId);

  const openClosures = await req.payload.find({
    collection: 'cash-closures',
    where: {
      and: [
        { cashRegister: { equals: normRegisterId } },
        { status: { equals: 'open' } },
        ...(normClosureId ? [{ id: { not_equals: normClosureId } }] : []),
      ],
    },
    limit: 1,
    depth: 0,
    req,
  });

  if (openClosures.totalDocs > 0) {
    const existing = openClosures.docs[0];
    const closureNumber =
      (existing as unknown as { closureNumber?: string }).closureNumber || existing.id;
    throw new Error(
      `La caja registradora ya tiene un turno abierto (${closureNumber}). Debe cerrarlo antes de abrir una nueva sesión.`,
    );
  }
}

/**
 * Actualiza el estado operativo actual de la caja registradora ('open' o 'closed')
 * de manera atómica y en la misma transacción de PostgreSQL.
 */
export async function updateCashRegisterOperationalStatus({
  cashRegisterId,
  newStatus,
  currentClosureId,
  req,
}: {
  cashRegisterId: number | string;
  newStatus: 'open' | 'closed';
  currentClosureId?: number | string | null;
  req: PayloadRequest;
}): Promise<void> {
  const normRegisterId = extractId(cashRegisterId);
  if (!normRegisterId) return;

  const numericRegisterId =
    typeof normRegisterId === 'number' ? normRegisterId : Number(normRegisterId);
  const normClosure = extractId(currentClosureId);
  const numericClosureId =
    normClosure !== null ? (typeof normClosure === 'number' ? normClosure : Number(normClosure)) : null;

  await runIsolatedContext(req, () =>
    req.payload.update({
      collection: 'cash-registers',
      id: numericRegisterId,
      data: {
        currentStatus: newStatus,
        currentClosure: newStatus === 'open' ? numericClosureId : null,
      },
      req,
      context: {
        ...req.context,
        skipStatusValidation: true,
      },
    }),
  );
}
