import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPayload } from 'payload';
import type { Payload, PayloadRequest } from 'payload';
import config from '@payload-config';
import type { Customer, Invoice, User } from '@/payload-types';
import { applyPaymentAllocations, getInvoicePaidAmount, recalculateCustomerBalance } from '@/utilities/financeLedger';
import { QUERY_PAGE_SIZE } from '@/utilities/paginatedQuery';

/**
 * ─── Ledger de clientes (CxC): cobros, reversos y saldos (Sprint CI-2) ──────
 *
 * Cubre el dominio que mueve el dinero de entrada. Los invariantes que se fijan
 * son numéricos y verificables:
 *  - un cobro confirmado baja el saldo de la factura y marca `partially_paid`/`paid`,
 *  - borrar el cobro RESTAURA el saldo (reverso),
 *  - una factura ANULADA nunca revive al reversar un cobro,
 *  - `getInvoicePaidAmount` sólo suma allocations CONFIRMADAS,
 *  - `recalculateCustomerBalance` = Σ saldos de facturas abiertas (+ vencido),
 *  - aislamiento: una imputación a una factura de OTRO cliente se rechaza.
 *
 * Se ejercita el camino REAL (hooks de la colección `customer-payments`), que es
 * donde se cablean `applyPaymentAllocations` / `reversePaymentAllocations`.
 */

const RUN = Date.now().toString(36);

type Row = Record<string, unknown>;

let payload: Payload;
let tenantId: number;
let customerId: number;
let otherCustomerId: number;
let user: User;

beforeAll(async () => {
  payload = await getPayload({ config });

  const tenant = await payload.create({
    collection: 'tenants',
    data: { name: `QA CxC ${RUN}`, slug: `qa-cxc-${RUN}`, salesConfig: { salesDocumentDefault: 'factura' } },
    overrideAccess: true,
  });
  tenantId = tenant.id;

  user = (await payload.create({
    collection: 'users',
    data: { email: `qa-cxc-${RUN}@example.com`, name: 'QA CxC', role: 'tenant-admin', password: 'test-12345678' },
    overrideAccess: true,
  })) as unknown as User;

  const customer = (await payload.create({
    collection: 'customers',
    data: { tenant: tenantId, name: `Cliente CxC ${RUN}`, taxId: `J-CXC-${RUN}`, phone: '0', status: 'lead' },
    draft: false,
    overrideAccess: true,
  })) as unknown as Customer;
  customerId = customer.id;

  const other = (await payload.create({
    collection: 'customers',
    data: { tenant: tenantId, name: `Cliente CxC OTRO ${RUN}`, taxId: `J-CXCO-${RUN}`, phone: '0', status: 'lead' },
    draft: false,
    overrideAccess: true,
  })) as unknown as Customer;
  otherCustomerId = other.id;
});

afterAll(async () => {
  const handle = payload.db as unknown as { destroy?: () => Promise<void> };
  if (handle?.destroy) await handle.destroy();
});

let invoiceSeq = 0;

async function createInvoice({
  total,
  customer = customerId,
  dueDate = futureDate(15),
}: {
  total: number;
  customer?: number;
  dueDate?: string;
}): Promise<Invoice> {
  invoiceSeq++;
  return (await payload.create({
    collection: 'invoices',
    data: {
      tenant: tenantId,
      invoiceNumber: `CXC-${RUN}-${invoiceSeq}`,
      customer,
      issueDate: new Date().toISOString(),
      dueDate,
      paymentTerms: 'credit',
      status: 'issued',
      exchangeRateSnapshot: 40,
      totalUSD: total,
      totalVES: total * 40,
      balanceUSD: total,
      balanceVES: total * 40,
      items: [{ description: `Servicio CxC ${RUN}`, quantity: 1, unitPriceUSD: total, totalUSD: total }],
    },
    draft: false,
    overrideAccess: true,
  })) as unknown as Invoice;
}

function futureDate(days: number): string {
  return new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
}

function pastDate(days: number): string {
  return new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
}

let paymentSeq = 0;

async function createPayment({
  allocations,
  amount,
  status = 'confirmed',
  customer = customerId,
}: {
  allocations?: Array<{ invoice: number; allocatedAmountUSD: number }>;
  amount: number;
  status?: 'pending' | 'confirmed' | 'rejected';
  customer?: number;
}): Promise<Row> {
  paymentSeq++;
  return (await payload.create({
    collection: 'customer-payments',
    data: {
      tenant: tenantId,
      paymentNumber: `RC-${RUN}-${paymentSeq}`,
      customer,
      paymentDate: new Date().toISOString(),
      status,
      methods: [{ method: 'cash_usd', currency: 'USD', amount, exchangeRate: 1 }],
      totalUSD: amount,
      allocations: allocations?.map((a) => ({ invoice: a.invoice, allocatedAmountUSD: a.allocatedAmountUSD })),
    },
    draft: false,
    overrideAccess: true,
  })) as unknown as Row;
}

async function invoiceById(id: number): Promise<Invoice> {
  return (await payload.findByID({
    collection: 'invoices',
    id,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Invoice;
}

async function customerById(id: number): Promise<Customer> {
  return (await payload.findByID({
    collection: 'customers',
    id,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Customer;
}

describe('ledger de clientes — cobros y saldos (CI-2)', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // REGRESIÓN del hallazgo P0 (Sprint CI-2b): el hook decidía si reconciliar el
  // saldo con `Array.isArray(data.items)`, que es SIEMPRE true en un `update`
  // (Payload rellena `data` con los campos clonados del documento original vía
  // getFallbackValue). Ahora usa `lineItemsChanged()`
  // (src/utilities/lineItems.ts), que compara por VALOR contra el documento
  // original. Estas pruebas nacieron como `it.fails` (ratchet) y hoy son `it`.
  // ─────────────────────────────────────────────────────────────────────────

  it('un cobro PARCIAL baja el saldo y marca la factura como partially_paid', async () => {
    const invoice = await createInvoice({ total: 100 });
    expect(Number(invoice.balanceUSD)).toBe(100);

    await createPayment({ amount: 40, allocations: [{ invoice: invoice.id, allocatedAmountUSD: 40 }] });

    const after = await invoiceById(invoice.id);
    expect(Number(after.balanceUSD)).toBe(60);
    expect(after.status).toBe('partially_paid');

    // El saldo del cliente (CxC) refleja el remanente.
    const customer = await customerById(customerId);
    expect(Number(customer.currentDebtUSD)).toBe(60);
  });

  it('un cobro TOTAL deja la factura en paid con saldo 0', async () => {
    const invoice = await createInvoice({ total: 35 });
    await createPayment({ amount: 35, allocations: [{ invoice: invoice.id, allocatedAmountUSD: 35 }] });

    const after = await invoiceById(invoice.id);
    expect(Number(after.balanceUSD)).toBe(0);
    expect(after.status).toBe('paid');
  });

  it('borrar el cobro RESTAURA el saldo de la factura (reverso)', async () => {
    const invoice = await createInvoice({ total: 80 });
    const payment = await createPayment({
      amount: 30,
      allocations: [{ invoice: invoice.id, allocatedAmountUSD: 30 }],
    });
    expect(Number((await invoiceById(invoice.id)).balanceUSD)).toBe(50);

    await payload.delete({ collection: 'customer-payments', id: Number(payment.id), overrideAccess: true });

    const restored = await invoiceById(invoice.id);
    expect(Number(restored.balanceUSD)).toBe(80);
    expect(restored.status).toBe('issued');
  });

  it('una factura ANULADA no revive al reversar un cobro', async () => {
    const invoice = await createInvoice({ total: 100 });
    const payment = await createPayment({
      amount: 40,
      allocations: [{ invoice: invoice.id, allocatedAmountUSD: 40 }],
    });

    // Anular la factura ANTES de borrar el cobro.
    await payload.update({
      collection: 'invoices',
      id: invoice.id,
      data: { status: 'voided' },
      draft: false,
      overrideAccess: true,
    });

    await payload.delete({ collection: 'customer-payments', id: Number(payment.id), overrideAccess: true });

    const after = await invoiceById(invoice.id);
    expect(after.status).toBe('voided');
  });

  it('getInvoicePaidAmount sólo suma allocations CONFIRMADAS', async () => {
    const invoice = await createInvoice({ total: 100 });

    await createPayment({ amount: 25, allocations: [{ invoice: invoice.id, allocatedAmountUSD: 25 }] });
    // Un cobro POR CONFIRMAR no debe contar todavía.
    await createPayment({
      amount: 15,
      status: 'pending',
      allocations: [{ invoice: invoice.id, allocatedAmountUSD: 15 }],
    });

    const tx = await payload.db.beginTransaction();
    const req = { payload, user, context: {}, transactionID: tx } as unknown as PayloadRequest;
    try {
      const paid = await getInvoicePaidAmount(invoice.id, req);
      expect(paid).toBe(25);
    } finally {
      if (tx) await payload.db.commitTransaction(tx);
    }
  });

  it(
    'getInvoicePaidAmount suma TODAS las páginas (más de una página de resultados)',
    async () => {
      // Regresión Devin #94 (🟡): con un `limit: 500` fijo, una cuenta con más
      // cobros confirmados que el límite sumaba sólo los primeros y, al reabrir o
      // des-anular la factura, se le devolvía deuda YA pagada. Se crean más de
      // UNA PÁGINA de cobros (QUERY_PAGE_SIZE): si el barrido no siguiera
      // `hasNextPage`, el total quedaría corto.
      const paymentsToCreate = QUERY_PAGE_SIZE + 5;
      const invoice = await createInvoice({ total: paymentsToCreate });

      for (let i = 0; i < paymentsToCreate; i += 1) {
        await createPayment({ amount: 1, allocations: [{ invoice: invoice.id, allocatedAmountUSD: 1 }] });
      }

      const tx = await payload.db.beginTransaction();
      const req = { payload, user, context: {}, transactionID: tx } as unknown as PayloadRequest;
      try {
        expect(await getInvoicePaidAmount(invoice.id, req)).toBe(paymentsToCreate);
      } finally {
        if (tx) await payload.db.commitTransaction(tx);
      }
    },
    180_000, // 105 altas reales (con sus hooks): se amplía el timeout del test
  );

  it('recalculateCustomerBalance = Σ saldos abiertos, y separa lo VENCIDO', async () => {
    const customer = (await payload.create({
      collection: 'customers',
      data: { tenant: tenantId, name: `Cliente Vencido ${RUN}`, taxId: `J-VENC-${RUN}`, phone: '0', status: 'lead' },
      draft: false,
      overrideAccess: true,
    })) as unknown as Customer;

    // 70 vencida (dueDate en el pasado) + 30 vigente = 100 de deuda, 70 vencido.
    await createInvoice({ total: 70, customer: customer.id, dueDate: pastDate(5) });
    await createInvoice({ total: 30, customer: customer.id, dueDate: futureDate(10) });

    const tx = await payload.db.beginTransaction();
    const req = { payload, user, context: {}, transactionID: tx } as unknown as PayloadRequest;
    try {
      const result = await recalculateCustomerBalance(customer.id, req);
      expect(result).not.toBeNull();
      expect(result?.currentDebtUSD).toBe(100);
      expect(result?.overdueDebtUSD).toBe(70);
    } finally {
      if (tx) await payload.db.commitTransaction(tx);
    }
  });

  it('rechaza imputar un cobro a una factura de OTRO cliente', async () => {
    const invoice = await createInvoice({ total: 50, customer: customerId });

    const tx = await payload.db.beginTransaction();
    const req = { payload, user, context: {}, transactionID: tx } as unknown as PayloadRequest;
    try {
      await expect(
        applyPaymentAllocations(
          [{ invoice: invoice.id, allocatedAmountUSD: 10 }],
          req,
          { customerId: otherCustomerId, tenantId },
        ),
      ).rejects.toThrow(/otro cliente/i);
    } finally {
      if (tx) await payload.db.rollbackTransaction(tx);
    }
  });

  // Otra mitad del contrato (CI-2b): si las líneas SÍ cambian, la reconciliación
  // debe seguir ejecutándose y conservar lo ya cobrado.
  it('editar las líneas SÍ reconcilia el saldo conservando lo cobrado', async () => {
    const invoice = await createInvoice({ total: 100 });
    await createPayment({ amount: 40, allocations: [{ invoice: invoice.id, allocatedAmountUSD: 40 }] });
    expect(Number((await invoiceById(invoice.id)).balanceUSD)).toBe(60);

    // Cambio real de líneas: 2 líneas por 150 USD en total.
    const updated = (await payload.update({
      collection: 'invoices',
      id: invoice.id,
      data: {
        items: [
          { description: 'A', quantity: 1, unitPriceUSD: 100, totalUSD: 100 },
          { description: 'B', quantity: 5, unitPriceUSD: 10, totalUSD: 50 },
        ],
      },
      draft: false,
      overrideAccess: true,
    })) as unknown as Invoice;

    // priorPaidUSD = 100 − 60 = 40 ⇒ nuevo saldo = 150 − 40 = 110.
    expect(Number(updated.totalUSD)).toBe(150);
    expect(Number(updated.balanceUSD)).toBe(110);
    expect(updated.status).toBe('partially_paid');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Regresión Devin (PR #100): si una factura YA PAGADA recibe líneas nuevas
  // (sube el total) deja de estar saldada. Antes, el atajo `paid` —que es
  // HEREDADO porque Payload rellena `data.status` desde `originalDoc` vía
  // cloneDataFromOriginalDoc— devolvía saldo 0 y la deuda nueva quedaba OCULTA:
  // los cargos añadidos nunca llegaban a CxC.
  // ─────────────────────────────────────────────────────────────────────────

  it('editar las líneas de una factura YA PAGADA expone la deuda nueva', async () => {
    const customer = (await payload.create({
      collection: 'customers',
      data: {
        tenant: tenantId,
        name: `Cliente Pagada ${RUN}`,
        taxId: `J-PAG-${RUN}`,
        phone: '0',
        status: 'lead',
      },
      draft: false,
      overrideAccess: true,
    })) as unknown as Customer;

    const invoice = await createInvoice({ total: 100, customer: customer.id });
    await createPayment({
      amount: 100,
      customer: customer.id,
      allocations: [{ invoice: invoice.id, allocatedAmountUSD: 100 }],
    });

    const settled = await invoiceById(invoice.id);
    expect(Number(settled.balanceUSD)).toBe(0);
    expect(settled.status).toBe('paid');
    expect(Number((await customerById(customer.id)).currentDebtUSD)).toBe(0);

    // Cargos añadidos: la factura pasa de 100 a 150 USD.
    const updated = (await payload.update({
      collection: 'invoices',
      id: invoice.id,
      data: {
        items: [
          { description: 'A', quantity: 1, unitPriceUSD: 100, totalUSD: 100 },
          { description: 'B (cargo nuevo)', quantity: 5, unitPriceUSD: 10, totalUSD: 50 },
        ],
      },
      draft: false,
      overrideAccess: true,
    })) as unknown as Invoice;

    expect(Number(updated.totalUSD)).toBe(150);
    // 150 − 100 realmente cobrados = 50 pendientes (antes: 0, deuda oculta).
    expect(Number(updated.balanceUSD)).toBe(50);
    expect(updated.status).toBe('partially_paid');

    // Y el remanente llega a la deuda del cliente (CxC).
    expect(Number((await customerById(customer.id)).currentDebtUSD)).toBe(50);
  });

  it('editar las líneas de una factura YA PAGADA a la baja la mantiene saldada', async () => {
    const invoice = await createInvoice({ total: 100 });
    await createPayment({
      amount: 100,
      allocations: [{ invoice: invoice.id, allocatedAmountUSD: 100 }],
    });

    const updated = (await payload.update({
      collection: 'invoices',
      id: invoice.id,
      data: { items: [{ description: 'A', quantity: 1, unitPriceUSD: 60, totalUSD: 60 }] },
      draft: false,
      overrideAccess: true,
    })) as unknown as Invoice;

    expect(Number(updated.totalUSD)).toBe(60);
    expect(Number(updated.balanceUSD)).toBe(0);
    expect(updated.status).toBe('paid');
  });

  it('marcar EXPLÍCITAMENTE como pagada una factura emitida sigue dejando saldo 0', async () => {
    const invoice = await createInvoice({ total: 80 });
    expect(Number(invoice.balanceUSD)).toBe(80);

    const updated = (await payload.update({
      collection: 'invoices',
      id: invoice.id,
      data: { status: 'paid' },
      draft: false,
      overrideAccess: true,
    })) as unknown as Invoice;

    expect(Number(updated.balanceUSD)).toBe(0);
    expect(updated.status).toBe('paid');
  });
});

