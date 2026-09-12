import { describe, expect, it } from 'vitest';
import {
  aggregateAgingByVendor,
  computeAgingRows,
  summarizeAging,
  type AgingInvoiceInput,
} from '@/utilities/arAging';
import { buildBusinessDateRange } from '@/utilities/erpValidation';

/**
 * ─── Reportes: antigüedad de cartera y ventana de fechas (Sprint CI-3) ───────
 *
 * `computeAgingRows` / `summarizeAging` / `aggregateAgingByVendor` SON la
 * matemática de los reportes de CxC/CxP (buckets 1-30/31-60/61-90/90+ y
 * agregados por cliente y por vendedor); `buildBusinessDateRange` es la ventana
 * de fechas con día de negocio Caracas (UTC-4) que usan el libro de ventas y los
 * libros de compras/cobros. Se fijan con números exactos.
 */

const AS_OF = new Date('2026-06-15T12:00:00.000Z'); // 08:00 en Caracas

function dueDaysAgo(days: number): string {
  return new Date(AS_OF.getTime() - days * 24 * 3600 * 1000).toISOString();
}

function invoice(over: Partial<AgingInvoiceInput> & { customerId: number; balanceUSD: number }): AgingInvoiceInput {
  return {
    customerName: `Cliente ${over.customerId}`,
    vendorId: null,
    vendorName: 'Sin vendedor',
    issueDate: dueDaysAgo(200),
    ...over,
  };
}

describe('reportes — antigüedad de cartera (CI-3)', () => {
  it('clasifica cada saldo en su bucket y agrupa por cliente', () => {
    const rows = computeAgingRows(
      [
        invoice({ customerId: 1, balanceUSD: 100, dueDate: dueDaysAgo(-5) }), // aún no vence
        invoice({ customerId: 1, balanceUSD: 200, dueDate: dueDaysAgo(20) }), // 1-30
        invoice({ customerId: 1, balanceUSD: 300, dueDate: dueDaysAgo(45) }), // 31-60
        invoice({ customerId: 1, balanceUSD: 400, dueDate: dueDaysAgo(75) }), // 61-90
        invoice({ customerId: 1, balanceUSD: 500, dueDate: dueDaysAgo(120) }), // 90+
      ],
      AS_OF,
    );

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.currentUSD).toBe(100);
    expect(row.bucket1_30).toBe(200);
    expect(row.bucket31_60).toBe(300);
    expect(row.bucket61_90).toBe(400);
    expect(row.bucket90Plus).toBe(500);
    expect(row.totalUSD).toBe(1500);
    // Vencido = todo lo que no es `current`.
    expect(row.overdueUSD).toBe(1400);
    expect(row.invoiceCount).toBe(5);
  });

  it('ignora saldos no positivos y ordena los clientes por deuda total desc', () => {
    const rows = computeAgingRows(
      [
        invoice({ customerId: 1, balanceUSD: 50, dueDate: dueDaysAgo(10) }),
        invoice({ customerId: 2, balanceUSD: 900, dueDate: dueDaysAgo(10) }),
        invoice({ customerId: 1, balanceUSD: 0, dueDate: dueDaysAgo(10) }), // saldo 0: fuera
        invoice({ customerId: 2, balanceUSD: -10, dueDate: dueDaysAgo(10) }), // negativo: fuera
      ],
      AS_OF,
    );

    expect(rows.map((r) => r.customerId)).toEqual([2, 1]);
    expect(rows[0].invoiceCount).toBe(1);
    expect(rows[1].totalUSD).toBe(50);
  });

  it('usa issueDate cuando la factura no tiene vencimiento', () => {
    const rows = computeAgingRows(
      [invoice({ customerId: 3, balanceUSD: 25, dueDate: null, issueDate: dueDaysAgo(40) })],
      AS_OF,
    );

    expect(rows[0].bucket31_60).toBe(25);
  });

  it('summarizeAging acumula los buckets y cuenta clientes con vencido', () => {
    const rows = computeAgingRows(
      [
        invoice({ customerId: 1, balanceUSD: 100, dueDate: dueDaysAgo(-5) }), // vigente
        invoice({ customerId: 2, balanceUSD: 200, dueDate: dueDaysAgo(10) }), // vencido
        invoice({ customerId: 3, balanceUSD: 300, dueDate: dueDaysAgo(70) }), // vencido
      ],
      AS_OF,
    );

    const summary = summarizeAging(rows);
    expect(summary.totalUSD).toBe(600);
    expect(summary.currentUSD).toBe(100);
    expect(summary.bucket1_30).toBe(200);
    expect(summary.bucket61_90).toBe(300);
    expect(summary.overdueUSD).toBe(500);
    expect(summary.customersWithOverdue).toBe(2);
    expect(summary.openInvoiceCount).toBe(3);
  });

  it('aggregateAgingByVendor consolida la cartera por vendedor (incluye "sin vendedor")', () => {
    const rows = computeAgingRows(
      [
        invoice({ customerId: 1, balanceUSD: 100, dueDate: dueDaysAgo(10), vendorId: 7, vendorName: 'Vendedor 7' }),
        invoice({ customerId: 2, balanceUSD: 250, dueDate: dueDaysAgo(10), vendorId: 7, vendorName: 'Vendedor 7' }),
        invoice({ customerId: 3, balanceUSD: 40, dueDate: dueDaysAgo(80), vendorId: null, vendorName: 'Sin vendedor' }),
      ],
      AS_OF,
    );

    const byVendor = aggregateAgingByVendor(rows);
    const vendor7 = byVendor.find((v) => v.vendorId === 7);
    const noVendor = byVendor.find((v) => v.vendorId === null);

    expect(vendor7?.totalUSD).toBe(350);
    expect(vendor7?.overdueUSD).toBe(350);
    expect(noVendor?.totalUSD).toBe(40);
    expect(noVendor?.bucket61_90).toBe(40);
  });

  it('buildBusinessDateRange usa el día de negocio Caracas (UTC-4) con tope exclusivo', () => {
    const sameDay = buildBusinessDateRange('2026-03-10', '2026-03-10', 'issueDate');

    expect(sameDay).toEqual([
      { issueDate: { greater_than_equal: '2026-03-10T04:00:00.000Z' } },
      { issueDate: { less_than: '2026-03-11T04:00:00.000Z' } },
    ]);

    // Sin filtros ⇒ sin condiciones.
    expect(buildBusinessDateRange(undefined, undefined, 'issueDate')).toEqual([]);

    // Sólo `from` ⇒ sólo el límite inferior.
    expect(buildBusinessDateRange('2026-03-10', undefined, 'issueDate')).toEqual([
      { issueDate: { greater_than_equal: '2026-03-10T04:00:00.000Z' } },
    ]);
  });
});
