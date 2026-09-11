import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPayload } from 'payload';
import type { Payload } from 'payload';
import config from '@payload-config';
import type { PayloadJob } from '@/payload-types';

/**
 * ─── Scheduling de alertas (Sprint R5 · S0-1/S7-2) ──────────────────────────
 *
 * Cubre el hallazgo de raíz: la tarea `evaluateAlerts` existía en el config y en
 * el snapshot, pero NINGUNA migración la agregó al enum del Jobs Queue, así que
 * `payload.jobs.queue({ task: 'evaluateAlerts' })` fallaba con 22P02 y el
 * evaluador NUNCA pudo encolarse. Además fija el scheduling nativo declarativo.
 */

let payload: Payload;

beforeAll(async () => {
  payload = await getPayload({ config });
});

afterAll(async () => {
  const db = (payload as unknown as { db?: { destroy?: () => Promise<void> } }).db;
  if (db?.destroy) await db.destroy();
});

describe('scheduling de alertas (R5)', () => {
  it('el config declara scheduling (schedule nativo habilitado → global de stats)', () => {
    const jobs = payload.config.jobs as { scheduling?: boolean } | undefined;
    expect(jobs?.scheduling).toBe(true);
  });

  it('encola y ejecuta evaluateAlerts (enum del Jobs Queue corregido)', async () => {
    const job = (await payload.jobs.queue({
      task: 'evaluateAlerts',
      input: {},
      queue: 'alerts',
    })) as { id: number };
    expect(job?.id).toBeTruthy();

    await payload.jobs.run({ queue: 'alerts' });

    const after = (await payload.findByID({
      collection: 'payload-jobs',
      id: job.id,
      depth: 0,
      overrideAccess: true,
    })) as unknown as PayloadJob;

    expect(after.completedAt).toBeTruthy();
    expect(after.hasError).toBeFalsy();
  });
});
