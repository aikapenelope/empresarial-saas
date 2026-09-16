import { describe, expect, it, vi } from 'vitest';

/**
 * ─── Health Route Unit Test (Sprint 46) ────────────────────────────────────
 *
 * Verifica el manejo del fallo de infraestructura en /api/health:
 * Cuando la base de datos no responde o el ping agota el tiempo, debe responder
 * HTTP 503 con { ok: false, status: 'degraded', database: 'disconnected' }
 * sin lanzar una excepción no capturada que rompa el runtime de Serverless.
 */

vi.mock('payload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('payload')>();
  return {
    ...actual,
    getPayload: vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:54322')),
  };
});

describe('GET /api/health (degraded mode)', () => {
  it('responde 503 con payload estructurado cuando la base de datos falla', async () => {
    const { GET } = await import('@/app/api/health/route');
    const response = await GET();

    expect(response.status).toBe(503);
    const data = await response.json();
    expect(data).toEqual({
      ok: false,
      status: 'degraded',
      database: 'disconnected',
    });
  });
});
