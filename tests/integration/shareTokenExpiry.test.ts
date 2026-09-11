import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPayload } from 'payload';
import type { Payload } from 'payload';
import config from '@payload-config';
import type { Customer, Invoice } from '@/payload-types';
import { resolveSharedDocument, shareTokenExpiry } from '@/utilities/documentSharing';

/**
 * ─── Integración: resolución del enlace público y revocación (R4 · S1-1) ────
 *
 * `resolveSharedDocument(token)` debe devolver el documento mientras el enlace
 * esté vigente, y NADA (null) cuando haya caducado o se haya revocado. Antes no
 * existía caducidad ni forma de invalidar el token.
 */

const RUN = Date.now().toString(36);

let payload: Payload;
let tenantId: number;
let customerId: number;

beforeAll(async () => {
  payload = await getPayload({ config });

  const tenant = await payload.create({
    collection: 'tenants',
    data: {
      name: `QA Share ${RUN}`,
      slug: `qa-share-${RUN}`,
      salesConfig: { salesDocumentDefault: 'factura' },
    },
    overrideAccess: true,
  });
  tenantId = tenant.id;

  const customer = (await payload.create({
    collection: 'customers',
    data: { tenant: tenantId, name: `Cliente Share ${RUN}`, taxId: `JS-${RUN}`, phone: '0000000000', status: 'lead' },
    draft: false,
    overrideAccess: true,
  })) as unknown as Customer;
  customerId = customer.id;
});

afterAll(async () => {
  const db = (payload as unknown as { db?: { destroy?: () => Promise<void> } }).db;
  if (db?.destroy) await db.destroy();
});

async function createSharedInvoice(
  token: string,
  expiresAt: string | null,
): Promise<Invoice> {
  return (await payload.create({
    collection: 'invoices',
    data: {
      tenant: tenantId,
      invoiceNumber: `SHR-${RUN}-${token.slice(-6)}`,
      customer: customerId,
      issueDate: new Date().toISOString(),
      dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      paymentTerms: 'cash',
      status: 'issued',
      exchangeRateSnapshot: 40,
      totalUSD: 10,
      totalVES: 400,
      balanceUSD: 10,
      balanceVES: 400,
      items: [{ description: `Servicio ${RUN}`, quantity: 1, unitPriceUSD: 10, totalUSD: 10 }],
      shareToken: token,
      shareTokenExpiresAt: expiresAt,
    },
    draft: false,
    overrideAccess: true,
  })) as unknown as Invoice;
}

describe('enlace público — caducidad y revocación (S1-1)', () => {
  it('un enlace vigente resuelve el documento', async () => {
    const token = `vig-${RUN}-aaaaaaaaaaaaaaaaaaaaaaaa`;
    const invoice = await createSharedInvoice(token, shareTokenExpiry());

    const resolved = await resolveSharedDocument(token);
    expect(resolved).not.toBeNull();
    expect(resolved?.doc.collection).toBe('invoices');
    expect(resolved?.doc.number).toBe(invoice.invoiceNumber);
  });

  it('un enlace caducado NO resuelve', async () => {
    const token = `exp-${RUN}-bbbbbbbbbbbbbbbbbbbbbbbb`;
    await createSharedInvoice(token, new Date(Date.now() - 60_000).toISOString());

    expect(await resolveSharedDocument(token)).toBeNull();
  });

  it('un enlace revocado NO resuelve', async () => {
    const token = `rev-${RUN}-cccccccccccccccccccccccc`;
    const invoice = await createSharedInvoice(token, shareTokenExpiry());
    expect(await resolveSharedDocument(token)).not.toBeNull();

    // Revocar (anula token + caducidad, como revokeShareTokenAction).
    await payload.update({
      collection: 'invoices',
      id: invoice.id,
      data: { shareToken: null, shareTokenExpiresAt: null },
      draft: false,
      overrideAccess: true,
    });

    expect(await resolveSharedDocument(token)).toBeNull();
  });
});

