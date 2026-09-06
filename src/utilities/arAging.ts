/**
 * Antigüedad de saldos (CxC) — Sprint 21. Utility PURA, sin dependencias de
 * Payload: importable desde cliente y servidor. El bucket se calcula con la
 * MISMA convención del hook de aging de Customers (base = dueDate || issueDate,
 * días vencidos desde hoy, floor por días calendario).
 *
 * Entrada: facturas YA filtradas por estado abierto (issued/partially_paid) y
 * con saldo positivo — el filtro de estados vive en la capa de datos
 * (erpData), que reutiliza los estados abiertos de ventas.
 */

export interface AgingInvoiceInput {
  customerId: number;
  customerName: string;
  vendorId: number | null;
  vendorName: string;
  balanceUSD: number;
  /** Fecha de vencimiento; si falta se usa issueDate (igual que el hook de Customers). */
  dueDate?: string | null;
  issueDate?: string | null;
}

export interface AgingRow {
  customerId: number;
  customerName: string;
  vendorId: number | null;
  vendorName: string;
  /** Sin vencimiento o aún vigente (días vencidos ≤ 0). */
  currentUSD: number;
  bucket1_30: number;
  bucket31_60: number;
  bucket61_90: number;
  bucket90Plus: number;
  totalUSD: number;
  /** Suma de saldos con días vencidos > 0. */
  overdueUSD: number;
  invoiceCount: number;
}

export interface AgingSummary {
  totalUSD: number;
  currentUSD: number;
  bucket1_30: number;
  bucket31_60: number;
  bucket61_90: number;
  bucket90Plus: number;
  overdueUSD: number;
  customersWithOverdue: number;
  openInvoiceCount: number;
}

export interface VendorAgingRow {
  vendorId: number | null;
  vendorName: string;
  currentUSD: number;
  bucket1_30: number;
  bucket31_60: number;
  bucket61_90: number;
  bucket90Plus: number;
  totalUSD: number;
  overdueUSD: number;
}

const DAY_MS = 1000 * 60 * 60 * 24;

/** Días vencidos al `asOf` (normalizados a medianoche): ≤ 0 significa vigente. */
function daysOverdue(baseDateStr: string | null | undefined, asOf: Date): number {
  if (!baseDateStr) return 0;
  const base = new Date(baseDateStr);
  if (Number.isNaN(base.getTime())) return 0;
  const baseMidnight = new Date(base.getFullYear(), base.getMonth(), base.getDate()).getTime();
  const asOfMidnight = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate()).getTime();
  return Math.floor((asOfMidnight - baseMidnight) / DAY_MS);
}

function emptyBucket(): Omit<AgingRow, 'customerId' | 'customerName' | 'vendorId' | 'vendorName'> {
  return {
    currentUSD: 0,
    bucket1_30: 0,
    bucket31_60: 0,
    bucket61_90: 0,
    bucket90Plus: 0,
    totalUSD: 0,
    overdueUSD: 0,
    invoiceCount: 0,
  };
}

function addInto(
  target: Omit<AgingRow, 'customerId' | 'customerName' | 'vendorId' | 'vendorName'>,
  balanceUSD: number,
  overdueDays: number,
): void {
  if (overdueDays <= 0) target.currentUSD += balanceUSD;
  else if (overdueDays <= 30) target.bucket1_30 += balanceUSD;
  else if (overdueDays <= 60) target.bucket31_60 += balanceUSD;
  else if (overdueDays <= 90) target.bucket61_90 += balanceUSD;
  else target.bucket90Plus += balanceUSD;

  if (overdueDays > 0) target.overdueUSD += balanceUSD;
  target.totalUSD += balanceUSD;
  target.invoiceCount += 1;
}

/** Agrega las facturas abiertas por cliente con su bucket de antigüedad. */
export function computeAgingRows(
  invoices: AgingInvoiceInput[],
  asOf: Date = new Date(),
): AgingRow[] {
  const byCustomer = new Map<number, AgingRow>();

  for (const inv of invoices) {
    const balance = Number(inv.balanceUSD) || 0;
    if (balance <= 0) continue;

    let row = byCustomer.get(inv.customerId);
    if (!row) {
      row = {
        customerId: inv.customerId,
        customerName: inv.customerName,
        vendorId: inv.vendorId,
        vendorName: inv.vendorName,
        ...emptyBucket(),
      };
      byCustomer.set(inv.customerId, row);
    }

    const base = inv.dueDate || inv.issueDate || null;
    const overdueDays = daysOverdue(base, asOf);
    addInto(row, balance, overdueDays);
  }

  const rows = [...byCustomer.values()].map((r) => ({
    ...r,
    currentUSD: Number(r.currentUSD.toFixed(2)),
    bucket1_30: Number(r.bucket1_30.toFixed(2)),
    bucket31_60: Number(r.bucket31_60.toFixed(2)),
    bucket61_90: Number(r.bucket61_90.toFixed(2)),
    bucket90Plus: Number(r.bucket90Plus.toFixed(2)),
    totalUSD: Number(r.totalUSD.toFixed(2)),
    overdueUSD: Number(r.overdueUSD.toFixed(2)),
  }));

  // Mayor deuda primero: la cartera se trabaja de arriba hacia abajo
  rows.sort((a, b) => b.totalUSD - a.totalUSD);
  return rows;
}

/** Resumen global de la cartera. */
export function summarizeAging(rows: AgingRow[]): AgingSummary {
  const summary: AgingSummary = {
    totalUSD: 0,
    currentUSD: 0,
    bucket1_30: 0,
    bucket31_60: 0,
    bucket61_90: 0,
    bucket90Plus: 0,
    overdueUSD: 0,
    customersWithOverdue: 0,
    openInvoiceCount: 0,
  };
  for (const row of rows) {
    summary.totalUSD += row.totalUSD;
    summary.currentUSD += row.currentUSD;
    summary.bucket1_30 += row.bucket1_30;
    summary.bucket31_60 += row.bucket31_60;
    summary.bucket61_90 += row.bucket61_90;
    summary.bucket90Plus += row.bucket90Plus;
    summary.overdueUSD += row.overdueUSD;
    summary.openInvoiceCount += row.invoiceCount;
    if (row.overdueUSD > 0) summary.customersWithOverdue += 1;
  }
  for (const key of [
    'totalUSD',
    'currentUSD',
    'bucket1_30',
    'bucket31_60',
    'bucket61_90',
    'bucket90Plus',
    'overdueUSD',
  ] as const) {
    summary[key] = Number(summary[key].toFixed(2));
  }
  return summary;
}

/** Misma cartera agregada por vendedor (para el canal). */
export function aggregateAgingByVendor(rows: AgingRow[]): VendorAgingRow[] {
  const byVendor = new Map<string, VendorAgingRow>();
  for (const row of rows) {
    const key = `${row.vendorId ?? 'none'}`;
    let agg = byVendor.get(key);
    if (!agg) {
      agg = {
        vendorId: row.vendorId,
        vendorName: row.vendorName,
        currentUSD: 0,
        bucket1_30: 0,
        bucket31_60: 0,
        bucket61_90: 0,
        bucket90Plus: 0,
        totalUSD: 0,
        overdueUSD: 0,
      };
      byVendor.set(key, agg);
    }
    agg.currentUSD += row.currentUSD;
    agg.bucket1_30 += row.bucket1_30;
    agg.bucket31_60 += row.bucket31_60;
    agg.bucket61_90 += row.bucket61_90;
    agg.bucket90Plus += row.bucket90Plus;
    agg.totalUSD += row.totalUSD;
    agg.overdueUSD += row.overdueUSD;
  }
  const list = [...byVendor.values()].map((v) => ({
    ...v,
    currentUSD: Number(v.currentUSD.toFixed(2)),
    bucket1_30: Number(v.bucket1_30.toFixed(2)),
    bucket31_60: Number(v.bucket31_60.toFixed(2)),
    bucket61_90: Number(v.bucket61_90.toFixed(2)),
    bucket90Plus: Number(v.bucket90Plus.toFixed(2)),
    totalUSD: Number(v.totalUSD.toFixed(2)),
    overdueUSD: Number(v.overdueUSD.toFixed(2)),
  }));
  list.sort((a, b) => b.totalUSD - a.totalUSD);
  return list;
}
