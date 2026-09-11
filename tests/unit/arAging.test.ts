import { describe, expect, it } from 'vitest';
import { computeAgingRows, type AgingInvoiceInput } from '@/utilities/arAging';

/**
 * ─── Antigüedad de saldos (Sprint R2 · hallazgo S3-1) ───────────────────────
 *
 * El bucket debe usar el DÍA DE NEGOCIO en America/Caracas (UTC-4, sin DST) —
 * la misma convención que `formatBusinessDate`. Antes se normalizaba con la zona
 * del runtime (UTC en Vercel), lo que desviaba un día los timestamps cercanos a
 * la medianoche UTC.
 */

function invoice(overrides: Partial<AgingInvoiceInput> = {}): AgingInvoiceInput {
  return {
    customerId: 1,
    customerName: 'Cliente QA',
    vendorId: null,
    vendorName: '—',
    balanceUSD: 100,
    dueDate: null,
    issueDate: null,
    ...overrides,
  };
}

describe('arAging — día de negocio (Caracas, UTC-4)', () => {
  it('un vencimiento de las 23:30 en Caracas cuenta 1 día al día siguiente (no 0)', () => {
    // 2026-09-01T23:30-04:00 === 2026-09-02T03:30Z. Día de negocio: 2026-09-01.
    const rows = computeAgingRows(
      [invoice({ dueDate: '2026-09-01T23:30:00-04:00' })],
      // 2026-09-02T12:00Z === 2026-09-02 08:00 en Caracas. Día de negocio: 2026-09-02.
      new Date('2026-09-02T12:00:00Z'),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].overdueUSD).toBe(100);
    expect(rows[0].bucket1_30).toBe(100);
    expect(rows[0].currentUSD).toBe(0);
  });

  it('una factura del mismo día de negocio sigue "vigente" (0 días)', () => {
    const rows = computeAgingRows(
      // 2026-09-02 00:30 en Caracas (01:30Z del mismo día UTC).
      [invoice({ dueDate: '2026-09-02T00:30:00-04:00' })],
      new Date('2026-09-02T12:00:00Z'),
    );
    expect(rows[0].currentUSD).toBe(100);
    expect(rows[0].overdueUSD).toBe(0);
  });

  it('clasifica correctamente el borde 30 → 31 días', () => {
    const rows = computeAgingRows(
      [invoice({ dueDate: '2026-08-01T12:00:00-04:00' })],
      new Date('2026-09-01T12:00:00-04:00'), // exactamente 31 días de negocio
    );
    expect(rows[0].bucket1_30).toBe(0);
    expect(rows[0].bucket31_60).toBe(100);
  });

  it('una fecha inválida o ausente no genera vencimiento', () => {
    const rows = computeAgingRows(
      [invoice({ dueDate: 'no-es-fecha', issueDate: null })],
      new Date('2026-09-02T12:00:00Z'),
    );
    expect(rows[0].currentUSD).toBe(100);
  });
});
