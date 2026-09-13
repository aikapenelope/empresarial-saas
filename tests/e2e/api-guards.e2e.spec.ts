import { expect, test } from '@playwright/test';

/**
 * ─── Smoke E2E: guardas de endpoints (Sprint CI-4) ──────────────────────────
 *
 * Verifica el comportamiento REAL de los endpoints HTTP que hasta ahora sólo
 * estaban cubiertos en unit (la función de acceso) o en integración (la tarea):
 *  - `GET /api/payload-jobs/run` (el runner que invoca el cron externo):
 *    sin `Bearer` → 401; con el secreto → 200. Es la puerta que la auditoría S0-1
 *    dejó cerrada en el Sprint R5.
 *  - `/share/{kind}/{token}` con token inexistente → 404 (nunca 200 ni 500).
 */

const CRON_SECRET = process.env.CRON_SECRET;

test.describe('superficie real — guardas de endpoints', () => {
  test('el runner de jobs rechaza peticiones sin secreto', async ({ request }) => {
    const response = await request.get('/api/payload-jobs/run?queue=alerts');
    expect(response.status()).toBe(401);
  });

  test('el runner de jobs acepta el cron con Bearer correcto', async ({ request }) => {
    test.skip(!CRON_SECRET, 'CRON_SECRET no configurado en el entorno de la suite');

    const response = await request.get('/api/payload-jobs/run?queue=alerts', {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });

    // El runner responde 200 con el resultado del barrido.
    expect(response.status()).toBe(200);
  });

  test('un enlace público con token inexistente responde 404', async ({ request }) => {
    // Token con FORMATO válido (32-128 chars de [A-Za-z0-9_-]) pero inexistente:
    // así se prueba el "no encontrado", no el rechazo por formato.
    const wellFormed = 'a'.repeat(40);
    const response = await request.get(`/share/invoice/${wellFormed}`);
    expect(response.status()).toBe(404);
  });
});
