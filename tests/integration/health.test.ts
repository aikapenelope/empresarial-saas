import { describe, expect, it } from 'vitest';
import { GET } from '@/app/api/health/route';

/**
 * ─── Health check (Sprint CI-5) ─────────────────────────────────────────────
 *
 * El endpoint se llama desde monitores externos y como smoke post-deploy, así
 * que su contrato debe ser estable: 200 + `{ ok: true }` con la BD viva, y SIN
 * requerir sesión (no lee cookies ni cabeceras).
 *
 * Se invoca el handler directamente (es una función de Next.js) contra el
 * Postgres real de la suite: es el único modo de probar que la consulta trivial
 * atraviesa el pool de Payload.
 */

describe('health check (CI-5)', () => {
  it('responde 200 con { ok: true } cuando la base de datos responde', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('responde SIN sesión (liveness público, sin datos de negocio)', async () => {
    // Si el handler dependiera de `headers()`/`cookies()`, esta llamada directa
    // fallaría (no hay request context de Next): ese es el invariante que fija.
    const response = await GET();

    expect(response.status).toBe(200);
    expect(Object.keys(await response.json())).toEqual(['ok']);
  });

  it('responde con diagnóstico enriquecido cuando se solicita ?verbose=true', async () => {
    const request = new Request('http://localhost:3000/api/health?verbose=true');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      ok: true,
      status: 'healthy',
      database: 'connected',
    });
  });
});
