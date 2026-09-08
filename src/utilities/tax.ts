/**
 * ─── Motor de impuestos (Sprint 42) ─────────────────────────────────────────
 *
 * Venezuela 2026: IVA general 16% (rango legal 8–16,5% — por eso el porcentaje
 * general es configurable por inquilino y no una constante), reducida 8%
 * (cedida básica), exenta 0%, IGTF 3% sobre pagos en divisa (configurable por
 * decreto y activable por inquilino). Los porcentajes viven en
 * `tenants.taxConfig`; el `taxRate` del catálogo (exempt/reduced/general)
 * clasifica cada línea. El desglose es INFORMATIVO para el libro fiscal: los
 * totales de la factura no cambian de semántica (totalUSD = suma de líneas).
 */

export type CatalogTaxRate = 'exempt' | 'reduced' | 'general';

/** Tasa reducida constitucional (cesta básica) — fija. */
export const REDUCED_RATE_PCT = 8;

const FX_METHODS = new Set(['cash_usd', 'zelle', 'binance']);

export function resolveLineRatePct(taxRate: CatalogTaxRate | undefined, generalRatePct: number): number {
  if (taxRate === 'general') return generalRatePct;
  if (taxRate === 'reduced') return REDUCED_RATE_PCT;
  return 0;
}

export interface TaxLineInput {
  totalUSD: number;
  taxRate?: CatalogTaxRate;
}

export interface InvoiceTaxBreakdown {
  taxBaseUSD: number;
  taxUSD: number;
}

/** Desglose IVA de la factura: base gravable + impuesto (redondeo a 2 dec). */
export function computeInvoiceTax(lines: TaxLineInput[], generalRatePct: number): InvoiceTaxBreakdown {
  let taxBaseUSD = 0;
  let taxUSD = 0;
  for (const line of lines) {
    const ratePct = resolveLineRatePct(line.taxRate, generalRatePct);
    if (ratePct <= 0) continue;
    const total = Number(line.totalUSD) || 0;
    taxBaseUSD += total;
    taxUSD += (total * ratePct) / 100;
  }
  return {
    taxBaseUSD: Number(taxBaseUSD.toFixed(2)),
    taxUSD: Number(taxUSD.toFixed(2)),
  };
}

/** Métodos de cobro en divisa extranjera — sujetos a IGTF. */
export function isFxPaymentMethod(method: string): boolean {
  return FX_METHODS.has(method);
}

/** IGTF del cobro (informativo: obligación del negocio sobre pagos en divisa). */
export function computeIgtfUSD(
  amountUSD: number,
  method: string,
  igtfPct: number,
  applyOnFx: boolean,
): number {
  if (!applyOnFx || !isFxPaymentMethod(method)) return 0;
  const pct = Number(igtfPct) || 0;
  if (pct <= 0) return 0;
  return Number((((Number(amountUSD) || 0) * pct) / 100).toFixed(2));
}
