import { describe, expect, it } from 'vitest';
import {
  calculateShiftDifferences,
  round2,
  type ShiftExpectedTotals,
} from '@/utilities/cashLedger';

/**
 * ─── Arqueo de caja: diferencias declarado vs esperado (Sprint CI-2) ─────────
 *
 * `calculateShiftDifferences` decide el FALTANTE/SOBRANTE del turno: el número
 * que ve el cajero y que alimenta el cierre. Es lógica contable pura (sin BD) y
 * hasta ahora no tenía cobertura. Se fijan los invariantes numéricos:
 * conversión multimoneda a USD con la tasa del turno, umbral de 1 centavo y
 * protección contra la división por cero cuando la tasa viene en 0.
 */

const zeroExpected: ShiftExpectedTotals = {
  expectedCashUSD: 0,
  expectedCashVES: 0,
  expectedPosVES: 0,
  expectedPagoMovilVES: 0,
  expectedTransferVES: 0,
  expectedZelleUSD: 0,
  expectedBinanceUSD: 0,
  netTotalUSD: 0,
};

describe('cashLedger — diferencias del arqueo', () => {
  it('round2 redondea a 2 decimales (coma flotante IEEE-754)', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(10.005)).toBe(10.01);
    expect(round2(-1.239)).toBe(-1.24);
  });

  it('declarado == esperado ⇒ sin descuadre y total 0', () => {
    const expected: ShiftExpectedTotals = {
      ...zeroExpected,
      expectedCashUSD: 100,
      expectedCashVES: 4000,
      expectedZelleUSD: 50,
    };
    const res = calculateShiftDifferences({
      declaredTotals: { cashUSD: 100, cashVES: 4000, zelleUSD: 50 },
      expected,
      exchangeRate: 40,
    });

    expect(res.hasDiscrepancy).toBe(false);
    expect(res.totalDiscrepancyUSD).toBe(0);
    expect(res.diffCashUSD).toBe(0);
    expect(res.diffCashVES).toBe(0);
  });

  it('detecta el FALTANTE de caja en USD (declarado < esperado)', () => {
    const res = calculateShiftDifferences({
      declaredTotals: { cashUSD: 90 },
      expected: { ...zeroExpected, expectedCashUSD: 100 },
      exchangeRate: 40,
    });

    expect(res.diffCashUSD).toBe(-10);
    expect(res.totalDiscrepancyUSD).toBe(-10);
    expect(res.hasDiscrepancy).toBe(true);
  });

  it('convierte las diferencias en VES a USD con la tasa del turno', () => {
    // 400 Bs de más con tasa 40 ⇒ +10 USD.
    const res = calculateShiftDifferences({
      declaredTotals: { cashVES: 400, posVES: 0 },
      expected: { ...zeroExpected, expectedCashVES: 0, expectedPosVES: 0 },
      exchangeRate: 40,
    });

    expect(res.diffCashVES).toBe(400);
    expect(res.totalDiscrepancyUSD).toBe(10);
    expect(res.hasDiscrepancy).toBe(true);
  });

  it('agrupa todas las diferencias convertidas en un solo total USD', () => {
    const res = calculateShiftDifferences({
      declaredTotals: { cashUSD: 0, cashVES: 40, posVES: 40, transferVES: 0, zelleUSD: 5 },
      expected: {
        ...zeroExpected,
        expectedCashUSD: 0,
        expectedCashVES: 0,
        expectedPosVES: 0,
        expectedTransferVES: 0,
        expectedZelleUSD: 0,
      },
      exchangeRate: 40,
    });

    // (40 + 40) / 40 = 2 USD en VES  +  5 USD directo  =  7 USD
    expect(res.totalDiscrepancyUSD).toBe(7);
  });

  it('con tasa 0 usa 1 para no dividir por cero', () => {
    const res = calculateShiftDifferences({
      declaredTotals: { cashVES: 10 },
      expected: zeroExpected,
      exchangeRate: 0,
    });

    expect(res.totalDiscrepancyUSD).toBe(10);
    expect(Number.isFinite(res.totalDiscrepancyUSD)).toBe(true);
  });

  it('un descuadre de 1 solo centavo ya se marca como discrepancia', () => {
    const res = calculateShiftDifferences({
      declaredTotals: { cashUSD: 100.01 },
      expected: { ...zeroExpected, expectedCashUSD: 100 },
      exchangeRate: 40,
    });

    expect(res.diffCashUSD).toBe(0.01);
    expect(res.hasDiscrepancy).toBe(true);
  });

  it('una diferencia por debajo del centavo NO marca discrepancia', () => {
    const res = calculateShiftDifferences({
      declaredTotals: { cashUSD: 100.004 },
      expected: { ...zeroExpected, expectedCashUSD: 100 },
      exchangeRate: 40,
    });

    expect(res.diffCashUSD).toBe(0);
    expect(res.hasDiscrepancy).toBe(false);
  });
});
