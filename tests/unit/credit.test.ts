import { describe, expect, it } from 'vitest';
import { evaluateCreditSale } from '@/utilities/credit';

describe('evaluateCreditSale (enforcement de crédito a crédito, IE-PR5)', () => {
  it('rechaza con creditAllowed false aunque haya límite y capacidad', () => {
    const r = evaluateCreditSale({
      creditAllowed: false,
      creditLimitUSD: 5000,
      currentDebtUSD: 0,
      totalUSD: 10,
      customerName: 'Comercial Delta',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      // Devin #83: código de máquina — credit_disabled es rechazo duro que
      // nunca se convierte en solicitud de aprobación.
      expect(r.code).toBe('credit_disabled');
      expect(r.reason).toContain('no tiene crédito habilitado');
    }
  });

  it('acepta cuando el total cabe en la capacidad disponible', () => {
    const r = evaluateCreditSale({
      creditAllowed: true,
      creditLimitUSD: 500,
      currentDebtUSD: 300,
      totalUSD: 150,
      customerName: 'Distribuidora Alpha',
    });
    expect(r).toEqual({ ok: true });
  });

  it('rechaza cuando el total excede la capacidad (límite − deuda)', () => {
    const r = evaluateCreditSale({
      creditAllowed: true,
      creditLimitUSD: 500,
      currentDebtUSD: 300,
      totalUSD: 250,
      customerName: 'Distribuidora Alpha',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('limit_exceeded');
      expect(r.reason).toContain('Límite de crédito insuficiente');
      expect(r.reason).toContain('disponible 200.00 USD');
      expect(r.reason).toContain('requerido 250.00 USD');
    }
  });

  it('tolera diferencias de redondeo dentro de medio centavo', () => {
    const r = evaluateCreditSale({
      creditAllowed: true,
      creditLimitUSD: 500,
      currentDebtUSD: 300,
      totalUSD: 200.004,
    });
    expect(r).toEqual({ ok: true });
  });

  it('deuda ausente se trata como cero (límite 100, total 100 → ok)', () => {
    const r = evaluateCreditSale({ creditAllowed: true, creditLimitUSD: 100, totalUSD: 100 });
    expect(r).toEqual({ ok: true });
  });

  it('límite ausente (→ 0) con crédito habilitado también bloquea por tope cero', () => {
    const r = evaluateCreditSale({ creditAllowed: true, totalUSD: 100 });
    expect(r.ok).toBe(false);
  });

  it('semántica de producción: límite 0 con crédito habilitado BLOQUEA (tope cero)', () => {
    const r = evaluateCreditSale({
      creditAllowed: true,
      creditLimitUSD: 0,
      currentDebtUSD: 0,
      totalUSD: 50,
    });
    expect(r.ok).toBe(false);
  });
});
