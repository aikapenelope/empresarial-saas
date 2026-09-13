import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPayload } from 'payload';
import type { Payload, PayloadRequest } from 'payload';
import config from '@payload-config';
import type { User } from '@/payload-types';
import {
  APPROVAL_TTL_HOURS,
  approvalExpiry,
  consumeApproval,
  isApprovalExpired,
} from '@/utilities/approvals';

/**
 * ─── Aprobaciones: motor single-use (Sprint CI-2) ───────────────────────────
 *
 * `consumeApproval` es la compuerta que impide que dos pestañas / un doble submit
 * emitan DOS facturas con la misma autorización. Sus invariantes no tenían
 * cobertura:
 *  - un solo uso (el segundo intento falla),
 *  - TTL de 24 h (expirada no es consumible),
 *  - binding aprobación ↔ operación (input distinto ⇒ rechazo),
 *  - aislamiento por inquilino,
 *  - y el fix de Devin #83 2ª ronda: el jsonb reordena claves, así que la
 *    comparación debe ser estructural (por valores), no por stringify.
 *
 * El consumo se prueba DENTRO de una transacción real, igual que en la venta.
 */

const RUN = Date.now().toString(36);

type Row = Record<string, unknown>;

let payload: Payload;
let tenantId: number;
let otherTenantId: number;
let user: User;

beforeAll(async () => {
  payload = await getPayload({ config });

  const tenant = await payload.create({
    collection: 'tenants',
    data: { name: `QA Aprob ${RUN}`, slug: `qa-aprob-${RUN}`, salesConfig: { salesDocumentDefault: 'factura' } },
    overrideAccess: true,
  });
  tenantId = tenant.id;

  const other = await payload.create({
    collection: 'tenants',
    data: { name: `QA Aprob OTRO ${RUN}`, slug: `qa-aprob-otro-${RUN}`, salesConfig: { salesDocumentDefault: 'factura' } },
    overrideAccess: true,
  });
  otherTenantId = other.id;

  user = (await payload.create({
    collection: 'users',
    data: { email: `qa-aprob-${RUN}@example.com`, name: 'QA Aprob', role: 'tenant-admin', password: 'test-12345678' },
    overrideAccess: true,
  })) as unknown as User;
});

afterAll(async () => {
  const handle = payload.db as unknown as { destroy?: () => Promise<void> };
  if (handle?.destroy) await handle.destroy();
});

/** Ejecuta `consumeApproval` en una transacción real (como la venta). */
async function consumeInTransaction(
  approvalId: number,
  expected: { tenantId: number; input: unknown },
): Promise<void> {
  const transactionID = await payload.db.beginTransaction();
  const req = {
    payload,
    user,
    context: {},
    transactionID,
  } as unknown as PayloadRequest;

  try {
    await consumeApproval(req, approvalId, expected);
    if (transactionID) await payload.db.commitTransaction(transactionID);
  } catch (error) {
    if (transactionID) await payload.db.rollbackTransaction(transactionID);
    throw error;
  }
}

async function seedApproval({
  status = 'approved',
  tenant = tenantId,
  expiresAt = approvalExpiry(),
  input = { productId: 7, quantity: 2 },
}: {
  status?: 'pending' | 'approved' | 'consumed' | 'rejected' | 'expired';
  tenant?: number;
  expiresAt?: string;
  input?: unknown;
} = {}): Promise<Row> {
  return (await payload.create({
    collection: 'approvals',
    data: {
      tenant,
      type: 'credit_over_limit',
      status,
      requestedBy: user.id,
      expiresAt,
      payload: { workflow: 'invoice', sourceId: null, input },
    },
    overrideAccess: true,
  })) as unknown as Row;
}

describe('aprobaciones — motor single-use (CI-2)', () => {
  it('approvalExpiry proyecta +24 h y una fecha pasada ya está expirada', () => {
    // Base en el FUTURO (1 h por delante) para que el TTL proyectado siga vigente.
    const from = new Date(Date.now() + 60 * 60 * 1000);
    const expiry = approvalExpiry(from);

    expect(new Date(expiry).getTime() - from.getTime()).toBe(APPROVAL_TTL_HOURS * 3600 * 1000);
    expect(isApprovalExpired(expiry)).toBe(false);
    expect(isApprovalExpired(new Date('2020-01-01T00:00:00.000Z').toISOString())).toBe(true);
    expect(isApprovalExpired(null)).toBe(false);
  });

  it('consume una aprobación aprobada y vigente', async () => {
    const approval = await seedApproval();

    await consumeInTransaction(Number(approval.id), {
      tenantId,
      input: { productId: 7, quantity: 2 },
    });

    const after = (await payload.findByID({
      collection: 'approvals',
      id: Number(approval.id),
      overrideAccess: true,
    })) as unknown as Row;
    expect(after.status).toBe('consumed');
  });

  it('es de UN SOLO USO: el segundo intento falla', async () => {
    const approval = await seedApproval();

    await consumeInTransaction(Number(approval.id), {
      tenantId,
      input: { productId: 7, quantity: 2 },
    });

    await expect(
      consumeInTransaction(Number(approval.id), { tenantId, input: { productId: 7, quantity: 2 } }),
    ).rejects.toThrow(/ya fue consumida/i);
  });

  it('rechaza una aprobación EXPIRADA (TTL 24 h)', async () => {
    const approval = await seedApproval({
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    await expect(
      consumeInTransaction(Number(approval.id), { tenantId, input: { productId: 7, quantity: 2 } }),
    ).rejects.toThrow(/expiró/i);
  });

  it('rechaza una aprobación que NO está aprobada', async () => {
    const approval = await seedApproval({ status: 'pending' });

    await expect(
      consumeInTransaction(Number(approval.id), { tenantId, input: { productId: 7, quantity: 2 } }),
    ).rejects.toThrow(/no está aprobada/i);
  });

  it('rechaza una aprobación de OTRO inquilino (aislamiento)', async () => {
    const approval = await seedApproval({ tenant: otherTenantId });

    await expect(
      consumeInTransaction(Number(approval.id), { tenantId, input: { productId: 7, quantity: 2 } }),
    ).rejects.toThrow(/otro inquilino/i);
  });

  it('binding: un input DISTINTO no autoriza la operación', async () => {
    const approval = await seedApproval({ input: { productId: 7, quantity: 2 } });

    await expect(
      consumeInTransaction(Number(approval.id), { tenantId, input: { productId: 7, quantity: 999 } }),
    ).rejects.toThrow(/no corresponde a la operación/i);
  });

  it('binding estructural: el reordenamiento de claves del jsonb NO rechaza una aprobación válida', async () => {
    // Regresión Devin #83 2ª ronda: jsonb no preserva el orden de claves.
    const approval = await seedApproval({ input: { productId: 7, quantity: 2 } });

    await consumeInTransaction(Number(approval.id), {
      tenantId,
      input: { quantity: 2, productId: 7 },
    });

    const after = (await payload.findByID({
      collection: 'approvals',
      id: Number(approval.id),
      overrideAccess: true,
    })) as unknown as Row;
    expect(after.status).toBe('consumed');
  });
});

