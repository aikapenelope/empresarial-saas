import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPayload } from 'payload';
import type { Payload } from 'payload';
import config from '@payload-config';
import type { Customer, Invoice, User } from '@/payload-types';
import { resolveSharedDocument, shareTokenExpiry } from '@/utilities/documentSharing';
import { ensureShareToken } from '@/utilities/shareTokens';

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
let userDoc: User;

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

  // Usuario real para probar el RBAC de campo (access) con overrideAccess:false.
  userDoc = (await payload.create({
    collection: 'users',
    data: { email: `qa-share-${RUN}@example.com`, name: 'QA Share', role: 'super-admin', password: 'test-12345678' },
    overrideAccess: true,
  })) as unknown as User;
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

describe('emisión y renovación del token (Devin #89)', () => {
  it('acuña caducidad a un token LEGADO sin romper el enlace ya distribuido', async () => {
    const token = `leg-${RUN}-dddddddddddddddddddddddd`;
    const invoice = await createSharedInvoice(token, null); // legado: token sin caducidad

    const ensured = await ensureShareToken(payload, 'invoices', invoice.id);
    expect(ensured).toBe(token); // NO rota: conserva el enlace ya entregado

    const after = (await payload.findByID({
      collection: 'invoices',
      id: invoice.id,
      depth: 0,
      overrideAccess: true,
      // Los campos shareToken* son `hidden`: se piden explícitamente (opción oficial).
      showHiddenFields: true,
    })) as unknown as Invoice;

    expect(after.shareTokenExpiresAt).toBeTruthy();
    expect(new Date(String(after.shareTokenExpiresAt)).getTime()).toBeGreaterThan(Date.now());
    // El enlace legado sigue resolviendo mientras esté vigente.
    expect(await resolveSharedDocument(token)).not.toBeNull();
  });

  it('rota el token VENCIDO y entrega uno vigente (no un enlace muerto)', async () => {
    const oldToken = `old-${RUN}-eeeeeeeeeeeeeeeeeeeeeeee`;
    const invoice = await createSharedInvoice(oldToken, new Date(Date.now() - 60_000).toISOString());
    expect(await resolveSharedDocument(oldToken)).toBeNull(); // vencido → no resuelve

    const ensured = await ensureShareToken(payload, 'invoices', invoice.id);
    expect(ensured).not.toBe(oldToken); // rotado

    expect(await resolveSharedDocument(ensured)).not.toBeNull(); // el nuevo SÍ resuelve
    expect(await resolveSharedDocument(oldToken)).toBeNull(); // el viejo queda muerto
  });

  it('dos emisiones concurrentes sobre un token vencido devuelven el MISMO token', async () => {
    const oldToken = `con-${RUN}-ffffffffffffffffffffffff`;
    const invoice = await createSharedInvoice(oldToken, new Date(Date.now() - 60_000).toISOString());

    const [a, b] = await Promise.all([
      ensureShareToken(payload, 'invoices', invoice.id),
      ensureShareToken(payload, 'invoices', invoice.id),
    ]);

    expect(a).toBe(b);
    expect(a).not.toBe(oldToken);
  });

  it('un escritor autenticado NO puede fijar ni extender la caducidad por API (Devin #89)', async () => {
    const token = `sec-${RUN}-999999999999999999999999`;
    const originalExpiry = shareTokenExpiry();
    const invoice = await createSharedInvoice(token, originalExpiry);

    // Access de CAMPO (no admin.readOnly): con RBAC real el intento no surte efecto.
    await payload.update({
      collection: 'invoices',
      id: invoice.id,
      data: { shareToken: 'attacker-token', shareTokenExpiresAt: null },
      draft: false,
      user: userDoc,
      overrideAccess: false,
    });

    const after = (await payload.findByID({
      collection: 'invoices',
      id: invoice.id,
      depth: 0,
      overrideAccess: true,
      showHiddenFields: true,
    })) as unknown as Invoice;

    expect(after.shareToken).toBe(token); // intacto
    expect(new Date(String(after.shareTokenExpiresAt)).toISOString()).toBe(
      new Date(originalExpiry).toISOString(),
    ); // intacta
  });
});

