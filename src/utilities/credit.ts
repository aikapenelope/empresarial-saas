/**
 * ─── Evaluación de venta a crédito (IE-PR5) ──────────────────────────────────
 *
 * Función PURA: sin dependencias de Payload ni BD — testeable en CI y
 * reutilizable desde cualquier caller (hoy createInvoiceCore; mañana la puerta
 * de aprobaciones del IE-PR6 se enchufa en este mismo punto).
 *
 * Semántica FIJADA por el comportamiento en producción desde el Sprint 10
 * (commit 1e68279) — se extrae tal cual, sin cambiar reglas:
 *  1. `creditAllowed === false` → rechaza, haya o no límite.
 *  2. Capacidad = creditLimitUSD − currentDebtUSD; el total debe caber con
 *     tolerancia de redondeo (+0.005 USD).
 *  3. `creditLimitUSD === 0` con crédito habilitado → BLOQUEA (tope cero):
 *     habilitar crédito sin límite no autoriza deuda ilimitada.
 *     (El diseño original del plan decía "0 = sin tope"; se preserva la regla
 *     vigente en producción — cambiarla sería decisión de negocio aparte.)
 */

export interface CreditSaleInput {
  creditAllowed?: boolean | null;
  creditLimitUSD?: number | null;
  currentDebtUSD?: number | null;
  /** Total de la venta que se intenta facturar a crédito (USD). */
  totalUSD: number;
  /** Nombre del cliente para el mensaje accionable. */
  customerName?: string;
}

export type CreditFailureCode = 'credit_disabled' | 'limit_exceeded';

export type CreditSaleEvaluation =
  | { ok: true }
  | { ok: false; code: CreditFailureCode; reason: string };

/** Tolerancia de redondeo (centavos) para no rechazar por floating point. */
const CREDIT_TOLERANCE_USD = 0.005;

export function evaluateCreditSale(input: CreditSaleInput): CreditSaleEvaluation {
  const name = input.customerName || 'el cliente';
  const total = Number(input.totalUSD) || 0;

  if (input.creditAllowed === false) {
    return {
      ok: false,
      // Devin #83: código legible por máquina — el crédito deshabilitado es
      // rechazo DURO y nunca se convierte en solicitud de aprobación.
      code: 'credit_disabled',
      reason: `El cliente "${name}" no tiene crédito habilitado. Registre la venta de contado o habilite su línea de crédito.`,
    };
  }

  const limit = Number(input.creditLimitUSD) || 0;
  const debt = Number(input.currentDebtUSD) || 0;
  const available = limit - debt;
  if (total > available + CREDIT_TOLERANCE_USD) {
    return {
      ok: false,
      code: 'limit_exceeded',
      reason: `Límite de crédito insuficiente para "${name}": disponible ${Math.max(available, 0).toFixed(2)} USD, requerido ${total.toFixed(2)} USD.`,
    };
  }

  return { ok: true };
}
