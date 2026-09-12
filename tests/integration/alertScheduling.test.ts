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
  it('el scheduling nativo está activo y la tarea vive en la cola `alerts`', () => {
    const jobs = payload.config.jobs as
      | {
          scheduling?: boolean;
          tasks?: Array<{ slug: string; schedule?: Array<{ queue?: string }> }>;
        }
      | undefined;

    expect(jobs?.scheduling).toBe(true);

    // Guarda del reporte Devin #90: la URL del cron DEBE seleccionar esta cola
    // (`?queue=alerts`). Sin el parámetro Payload opera la cola `default` y esta
    // tarea nunca se encolaría; si alguien mueve la tarea de cola, este test
    // obliga a actualizar la URL documentada.
    const task = jobs?.tasks?.find((t) => t.slug === 'evaluateAlerts');
    expect(task?.schedule?.[0]?.queue).toBe('alerts');
  });

  it('encola y ejecuta evaluateAlerts (enum del Jobs Queue corregido)', async () => {
    const job = (await payload.jobs.queue({
      task: 'evaluateAlerts',
      input: {},
      queue: 'alerts',
    })) as { id: number };
    expect(job?.id).toBeTruthy();

    // `runByID` ejecuta EXACTAMENTE este job, de forma determinista (sin depender
    // de otros pendientes que hayan quedado en la cola de corridas previas). El
    // encolado en la cola `alerts` —que es lo que el cron DEBE seleccionar con
    // `?queue=alerts`— queda fijado por el test de wiring de arriba.
    await payload.jobs.runByID({ id: job.id });

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
