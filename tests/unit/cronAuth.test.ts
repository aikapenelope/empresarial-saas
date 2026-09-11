import { afterEach, describe, expect, it } from 'vitest';
import type { PayloadRequest } from 'payload';
import { canRunScheduledJobs, isCronAuthorized } from '@/utilities/cronAuth';

/**
 * ─── Guarda del trigger nativo de jobs programados (R5 · S0-1/S7-2) ─────────
 *
 * `GET /api/payload-jobs/run` es público por defecto en Payload; el guard lo
 * limita al cron (Bearer CRON_SECRET) o a un usuario autenticado.
 */

function req(headers: Record<string, string> = {}, user?: unknown): PayloadRequest {
  return { headers: new Headers(headers), user } as unknown as PayloadRequest;
}

describe('cronAuth — trigger de jobs programados (R5)', () => {
  const original = process.env.CRON_SECRET;

  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it('fail-closed cuando falta CRON_SECRET', () => {
    delete process.env.CRON_SECRET;
    expect(isCronAuthorized(req({ authorization: 'Bearer lo-que-sea' }))).toBe(false);
  });

  it('acepta únicamente el Bearer exacto', () => {
    process.env.CRON_SECRET = 'secreto-r5';
    expect(isCronAuthorized(req({ authorization: 'Bearer secreto-r5' }))).toBe(true);
    expect(isCronAuthorized(req())).toBe(false);
    expect(isCronAuthorized(req({ authorization: 'Bearer otro' }))).toBe(false);
    expect(isCronAuthorized(req({ authorization: 'Bearer secreto-r5-extra' }))).toBe(false);
  });

  it('canRunScheduledJobs: cron o usuario autenticado, nunca anónimo', () => {
    process.env.CRON_SECRET = 'secreto-r5';
    expect(canRunScheduledJobs({ req: req({}, { id: 1 }) })).toBe(true);
    expect(canRunScheduledJobs({ req: req({ authorization: 'Bearer secreto-r5' }) })).toBe(true);
    expect(canRunScheduledJobs({ req: req() })).toBe(false);
  });
});
