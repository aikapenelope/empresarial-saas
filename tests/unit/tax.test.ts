import { describe, expect, it } from 'vitest';
import { computeInvoiceTax, computeIgtfUSD, resolveLineRatePct } from '@/utilities/tax';

describe('computeInvoiceTax (desglose IVA por línea del catálogo)', () => {
  it('líneas mixtas exenta/reducida/general con alícuota configurable', () => {
    const t = computeInvoiceTax(
      [
        { totalUSD: 100, taxRate: 'exempt' },
        { totalUSD: 100, taxRate: 'reduced' }, // 8%
        { totalUSD: 200, taxRate: 'general' }, // 16%
      ],
      16,
    );

    expect(t.taxBaseUSD).toBe(300);
    expect(t.taxUSD).toBe(40); // 8 + 32
  });

  it('la alícuota general es configurable (decreto 16,5% sin cambiar código)', () => {
    const t = computeInvoiceTax([{ totalUSD: 200, taxRate: 'general' }], 16.5);
    expect(t.taxUSD).toBe(33);
    expect(t.taxBaseUSD).toBe(200);
  });

  it('líneas de texto libre sin producto son exentas', () => {
    const t = computeInvoiceTax([{ totalUSD: 100 }], 16);
    expect(t).toEqual({ taxBaseUSD: 0, taxUSD: 0 });
  });

  it('resolveLineRatePct mapea el enum del catálogo', () => {
    expect(resolveLineRatePct('exempt', 16)).toBe(0);
    expect(resolveLineRatePct('reduced', 16)).toBe(8);
    expect(resolveLineRatePct('general', 16)).toBe(16);
    expect(resolveLineRatePct(undefined, 16)).toBe(0);
  });
});

describe('computeIgtfUSD (IGTF sobre pagos en divisa)', () => {
  it('aplica el porcentaje del inquilino a métodos en divisa', () => {
    expect(computeIgtfUSD(100, 'zelle', 3, true)).toBe(3);
    expect(computeIgtfUSD(250, 'binance', 3, true)).toBe(7.5);
    expect(computeIgtfUSD(100, 'cash_usd', 3, true)).toBe(3);
  });

  it('los métodos en VES no llevan IGTF', () => {
    expect(computeIgtfUSD(100, 'cash_ves', 3, true)).toBe(0);
    expect(computeIgtfUSD(100, 'pago_movil', 3, true)).toBe(0);
    expect(computeIgtfUSD(100, 'transfer_ves', 3, true)).toBe(0);
    expect(computeIgtfUSD(100, 'pos_ves', 3, true)).toBe(0);
  });

  it('se puede desactivar por inquilino o dejar el porcentaje en cero', () => {
    expect(computeIgtfUSD(100, 'zelle', 3, false)).toBe(0);
    expect(computeIgtfUSD(100, 'zelle', 0, true)).toBe(0);
  });
});
