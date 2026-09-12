import crypto from 'crypto';
import type { PayloadRequest } from 'payload';

/**
 * ─── Autorización del trigger de jobs programados (Sprint R5 · S0-1/S7-2) ───
 *
 * Payload expone `GET /api/payload-jobs/run` y `GET /api/payload-jobs/handle-schedules`
 * (GET a propósito, para poder invocarse desde un Vercel Cron). Por defecto esos
 * endpoints son PÚBLICOS (`jobs.access.run ?? (() => true)`); este guard los
 * protege: sólo el cron (Bearer CRON_SECRET) o un usuario autenticado pueden
 * dispararlos. Fail-closed si `CRON_SECRET` no está configurado.
 *
 * Nota: la Local API `payload.jobs.run()` NO pasa por este access (usa
 * `overrideAccess` por defecto true), así que el uso interno no se ve afectado.
 */

/** Comparación de strings en tiempo constante (no filtra el secreto por timing). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** ¿La petición trae `Authorization: Bearer <CRON_SECRET>`? Fail-closed sin secreto. */
export function isCronAuthorized(req: Pick<PayloadRequest, 'headers'>): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers?.get?.('authorization') || '';
  return safeEqual(header, `Bearer ${secret}`);
}

/**
 * Access de `jobs.run`: el cron (secreto) o un **super-admin**. NUNCA un usuario
 * de inquilino: el runner es GLOBAL — procesa todas las colas con
 * `overrideAccess` — y dispararía tareas de sistema cross-tenant (p. ej.
 * `evaluateAlerts` recorre TODOS los inquilinos). Reporte Devin #90.
 */
export function canRunScheduledJobs({ req }: { req: PayloadRequest }): boolean {
  if (isCronAuthorized(req)) return true;
  return req.user?.role === 'super-admin';
}
