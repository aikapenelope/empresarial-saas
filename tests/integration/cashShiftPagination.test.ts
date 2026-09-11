import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPayload } from 'payload';
import type { Payload, PayloadRequest } from 'payload';
import config from '@payload-config';
import type { CashRegister, Customer, User, Warehouse } from '@/payload-types';
import { computeShiftTransactions } from '@/utilities/cashLedger';

/**
 * ─── Integración: arqueo de caja sin truncación (Sprint R3 · S2-2) ──────────
 *
 * `computeShiftTransactions` consolidaba cobros/pagos con `limit: 1000` en UNA
 * sola consulta: un turno con más movimientos calculaba el esperado sobre datos
 * parciales → descuadre falso. El fix recorre TODAS las páginas (page size 100);
 * este test crea 105 cobros y exige que el total refleje los 105 (con el
 * comportamiento anterior —o sin paginación— el total saldría 100 × 10 = 1000).
 */

const RUN = Date.now().toString(36);
const PAYMENT_COUNT = 105;
const PAYMENT_AMOUNT_USD = 10;

let payload: Payload;
let tenantId: number;
let registerId: number;
let customerId: number;
let userDoc: User;

beforeAll(async () => {
  payload = await getPayload({ config });

  const tenant = await payload.create({
    collection: 'tenants',
    data: {
      name: `QA Caja ${RUN}`,
      slug: `qa-caja-${RUN}`,
      salesConfig: { salesDocumentDefault: 'factura' },
    },
    overrideAccess: true,
  });
  tenantId = tenant.id;

  const warehouse = (await payload.create({
    collection: 'warehouses',
    data: { tenant: tenantId, name: 'Almacén Caja QA', code: `QAW-${RUN}`, type: 'main', isDefault: true, isActive: true },
    overrideAccess: true,
  })) as unknown as Warehouse;

  const register = (await payload.create({
    collection: 'cash-registers',
    data: {
      tenant: tenantId,
      name: 'Caja QA',
      code: `QAC-${RUN}`,
      warehouse: warehouse.id,
      currentStatus: 'closed',
      active: true,
    },
    overrideAccess: true,
  })) as unknown as CashRegister;
  registerId = register.id;

  const customer = (await payload.create({
    collection: 'customers',
    data: { tenant: tenantId, name: `Cliente Caja ${RUN}`, taxId: `JC-${RUN}`, phone: '0000000000', status: 'lead' },
    draft: false,
    overrideAccess: true,
  })) as unknown as Customer;
  customerId = customer.id;

  userDoc = (await payload.create({
    collection: 'users',
    data: { email: `qa-caja-${RUN}@example.com`, name: 'QA Caja', role: 'super-admin', password: 'test-12345678' },
    overrideAccess: true,
  })) as unknown as User;
});

afterAll(async () => {
  const db = (payload as unknown as { db?: { destroy?: () => Promise<void> } }).db;
  if (db?.destroy) await db.destroy();
});

async function createConfirmedPayment(index: number, paymentDate: string): Promise<void> {
  await payload.create({
    collection: 'customer-payments',
    data: {
      tenant: tenantId,
      paymentNumber: `REC-${RUN}-${String(index).padStart(4, '0')}`,
      customer: customerId,
      paymentDate,
      status: 'confirmed',
      cashRegister: registerId,
      methods: [{ method: 'cash_usd', currency: 'USD', amount: PAYMENT_AMOUNT_USD, exchangeRate: 1 }],
      totalUSD: PAYMENT_AMOUNT_USD,
      allocations: [],
    },
    draft: false,
    overrideAccess: true,
    // El arqueo no necesita el recálculo de deuda por cada cobro de la prueba.
    context: { skipBalanceRecalculation: true },
  });
}

describe('arqueo de caja — paginación completa (S2-2)', () => {
  it('consolida TODOS los cobros del turno, más allá de una página', async () => {
    const paymentDate = new Date().toISOString();
    for (let i = 0; i < PAYMENT_COUNT; i += 1) {
      await createConfirmedPayment(i, paymentDate);
    }

    const transactionID = await payload.db.beginTransaction();
    const req = {
      payload,
      user: userDoc,
      context: {},
      transactionID,
    } as unknown as PayloadRequest;

    try {
      const totals = await computeShiftTransactions({
        cashRegisterId: registerId,
        tenantId,
        openedAt: new Date(Date.now() - 3_600_000).toISOString(),
        closedAt: new Date(Date.now() + 3_600_000).toISOString(),
        openingFloat: { cashUSD: 0, cashVES: 0 },
        req,
      });

      const expected = PAYMENT_COUNT * PAYMENT_AMOUNT_USD;
      expect(totals.collections.cashUSD).toBe(expected);
      expect(totals.collections.totalCollectionsUSD).toBe(expected);
      // Con truncación a una sola página (100), el total habría sido 1000.
      expect(totals.collections.cashUSD).toBeGreaterThan(100 * PAYMENT_AMOUNT_USD);
    } finally {
      if (transactionID) await payload.db.commitTransaction(transactionID);
    }
  });
});

