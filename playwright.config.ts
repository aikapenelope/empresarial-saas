import { defineConfig, devices } from '@playwright/test';

/**
 * ─── Playwright (Sprint CI-4) — SMOKE E2E ───────────────────────────────────
 *
 * Suite DELIBERADAMENTE pequeña y de alto valor: comprueba la SUPERFICIE REAL
 * que las pruebas de Vitest no pueden tocar (navegador + build de producción):
 *  1. el admin de Payload RENDERIZA de verdad bajo la CSP,
 *  2. las cabeceras de seguridad llegan al cliente,
 *  3. el guard del runner de jobs responde 401/200.
 *
 * Patrón OFICIAL (templates/website/playwright.config.ts del repo de Payload):
 * `webServer` levanta `pnpm build && pnpm start` — build de PRODUCCIÓN, no
 * `pnpm dev`. Se descarta a propósito el patrón de otros repos del autor
 * (dev server + endpoint de seed por HTTP + secreto compartido): era frágil y
 * fallaba por desajustes de entorno/secreto.
 *
 * Coste: este suite NO corre en cada PR (ver .github/workflows/e2e.yml):
 * es manual + nocturno, porque el repo es privado y los minutos de Actions se
 * descuentan de la cuota gratuita.
 */
export default defineConfig({
  testDir: './tests/e2e',
  // No dejar un test.only olvidado en un PR.
  forbidOnly: !!process.env.CI,
  // En CI, reintentar absorbe el arranque en frío del primer test.
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 60_000,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chromium' },
    },
  ],
  webServer: {
    command: 'pnpm build && pnpm start',
    url: 'http://localhost:3000/admin/login',
    reuseExistingServer: !process.env.CI,
    timeout: 5 * 60 * 1000,
    env: {
      // El runner de jobs exige el mismo secreto que usa el cron externo.
      ...(process.env.CRON_SECRET ? { CRON_SECRET: process.env.CRON_SECRET } : {}),
    },
  },
});
