import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPayload } from 'payload';
import type { Payload, PayloadRequest } from 'payload';
import config from '@payload-config';
import type { User } from '@/payload-types';
import { withTransaction } from '@/utilities/withTransaction';
import { nextDocumentNumber } from '@/utilities/documentNumbering';

/**
 * ─── Infra de Server Actions extraída (Sprint R6) ───────────────────────────
 *
 * `withTransaction` y `nextDocumentNumber` se movieron de `erpActions.ts` a
 * `utilities/` (constitución §2.1). Este test fija su comportamiento sobre
 * Postgres real: commit/rollback atómico y numeración con formato del sistema.
 */

const RUN = Date.now().toString(36);

let payload: Payload;
let tenantId: number;
let user: User;

beforeAll(async () => {
  payload = await getPayload({ config });

  const tenant = await payload.create({
    collection: 'tenants',
    data: { name: `QA Infra ${RUN}`, slug: `qa-infra-${RUN}`, salesConfig: { salesDocumentDefault: 'factura' } },
    overrideAccess: true,
  });
  tenantId = tenant.id;

  user = (await payload.create({
    collection: 'users',
    data: { email: `qa-infra-${RUN}@example.com`, name: 'QA Infra', role: 'super-admin', password: 'test-12345678' },
    overrideAccess: true,
  })) as unknown as User;
});

afterAll(async () => {
  const db = (payload as unknown as { db?: { destroy?: () => Promise<void> } }).db;
  if (db?.destroy) await db.destroy();
});

async function customerByTaxId(taxId: string) {
  const res = await payload.find({
    collection: 'customers',
    where: { taxId: { equals: taxId } },
    overrideAccess: true,
  });
  return res.docs;
}

describe('infra de Server Actions (R6)', () => {
  it('withTransaction commitea el bloque exitoso', async () => {
    const taxId = `J-COMMIT-${RUN}`;
    const customerId = await withTransaction(payload, user, async (req) => {
      const c = await payload.create({
        collection: 'customers',
        data: { tenant: tenantId, name: `Commit ${RUN}`, taxId, phone: '0', status: 'lead' },
        draft: false,
        req,
        overrideAccess: true,
      });
      return c.id;
    });

    expect(customerId).toBeTruthy();
    expect(await customerByTaxId(taxId)).toHaveLength(1);
  });

  it('withTransaction hace rollback completo si el bloque lanza', async () => {
    const taxId = `J-ROLLBACK-${RUN}`;

    await expect(
      withTransaction(payload, user, async (req) => {
        await payload.create({
          collection: 'customers',
          data: { tenant: tenantId, name: `Rollback ${RUN}`, taxId, phone: '0', status: 'lead' },
          draft: false,
          req,
          overrideAccess: true,
        });
        throw new Error('boom-r6');
      }),
    ).rejects.toThrow('boom-r6');

    expect(await customerByTaxId(taxId)).toHaveLength(0);
  });

  it('nextDocumentNumber emite el correlativo con el formato del sistema', async () => {
    const transactionID = await payload.db.beginTransaction();
    const req = {
      payload,
      user,
      context: {},
      transactionID,
    } as unknown as PayloadRequest;

    try {
      const prefix = `ZZ${RUN.slice(-3)}`;
      const n = await nextDocumentNumber(payload, 'invoices', tenantId, prefix, req);
      expect(n).toMatch(new RegExp(`^${prefix}-\\d{5}$`));
    } finally {
      if (transactionID) await payload.db.commitTransaction(transactionID);
    }
  });
});
