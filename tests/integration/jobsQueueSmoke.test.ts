import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPayload } from 'payload';
import type { Payload } from 'payload';
import config from '@payload-config';

/**
 * ─── Smoke de la cola de jobs (Sprint CI-1) ─────────────────────────────────
 *
 * Reproduce, de forma mínima, el punto exacto que rompió el Sprint R5: encolar
 * cada tarea REGISTRADA en el config. `payload.jobs.queue` hace un INSERT en
 * `payload_jobs` que incluye la columna `meta` (la crea el scheduling de Payload)
 * y el valor `task_slug` contra `enum_payload_jobs_task_slug`.
 *
 * Si falta la migración del enum o del `meta` (drift de snapshot), este test
 * falla con 42703/22P02 en vez de dejar la cola muerta en producción. NO ejecuta
 * la tarea (no corre handlers ni envía correos): sólo verifica que se puede
 * encolar, y borra el job inmediatamente.
 */

type Row = Record<string, unknown>;

let payload: Payload;
const createdJobIds: (number | string)[] = [];

beforeAll(async () => {
  payload = await getPayload({ config });
});

afterAll(async () => {
  // Limpieza: `deleteJobOnComplete: false` conserva los jobs, así que el smoke
  // no debe dejar residuos en la cola.
  for (const id of createdJobIds) {
    await payload
      .delete({ collection: 'payload-jobs', id, overrideAccess: true })
      .catch(() => undefined);
  }

  const handle = payload.db as unknown as { destroy?: () => Promise<void> };
  if (handle?.destroy) await handle.destroy();
});

describe('smoke de la cola de jobs (CI-1)', () => {
  it('cada tarea registrada en el config se puede encolar', async () => {
    const tasks = payload.config.jobs?.tasks ?? [];
    expect(tasks.length).toBeGreaterThan(0);

    for (const task of tasks) {
      const args = { task: task.slug, input: {} } as unknown as Parameters<
        Payload['jobs']['queue']
      >[0];
      const job = (await payload.jobs.queue(args)) as unknown as Row;

      expect(job, `No se pudo encolar la tarea ${task.slug}`).toBeTruthy();
      expect(job.taskSlug).toBe(task.slug);
      expect(job.id).toBeTruthy();

      createdJobIds.push(job.id as number | string);
    }
  });
});
