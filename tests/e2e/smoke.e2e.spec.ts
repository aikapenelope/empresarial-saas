import { expect, test } from '@playwright/test';

/**
 * ─── Smoke E2E (Sprint CI-4) ────────────────────────────────────────────────
 *
 * Lo que se comprueba aquí y NO se puede comprobar con Vitest:
 *  - que el **build de producción** sirve el admin en el navegador,
 *  - que la **CSP no rompe** el panel (sin violaciones ni assets bloqueados),
 *  - que el login del admin se renderiza con sus campos.
 *
 * No requiere seed ni base de datos: sólo el servidor levantado por el
 * `webServer` de `playwright.config.ts`.
 */

const ADMIN_LOGIN = '/admin/login';

test.describe('superficie real — admin y cabeceras', () => {
  test('el admin de Payload renderiza el login bajo la CSP (sin violaciones)', async ({ page }) => {
    const cspViolations: string[] = [];
    const pageErrors: string[] = [];
    const failedSameOrigin: string[] = [];

    page.on('console', (message) => {
      const text = message.text();
      if (/Content Security Policy|Refused to (load|execute|apply|connect)/i.test(text)) {
        cspViolations.push(text);
      }
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('requestfailed', (request) => {
      if (request.url().startsWith('http://localhost:3000')) {
        failedSameOrigin.push(`${request.url()} → ${request.failure()?.errorText ?? 'unknown'}`);
      }
    });

    const response = await page.goto(ADMIN_LOGIN, { waitUntil: 'networkidle' });

    expect(response?.status()).toBe(200);

    // Los campos del login de Payload (id = `field-<nombre>`, generateFieldID).
    await expect(page.locator('#field-email')).toBeVisible();
    await expect(page.locator('#field-password')).toBeVisible();

    // Sin violaciones de CSP, sin errores de página, sin assets propios caídos.
    expect(cspViolations, `Violaciones de CSP:\n${cspViolations.join('\n')}`).toEqual([]);
    expect(pageErrors, `Errores de página:\n${pageErrors.join('\n')}`).toEqual([]);
    expect(
      failedSameOrigin,
      `Peticiones propias fallidas:\n${failedSameOrigin.join('\n')}`,
    ).toEqual([]);
  });

  test('el panel de admin carga su bundle tras el login renderizado (health de assets)', async ({
    page,
  }) => {
    // El login es una RSC con CSS/JS propios: si la CSP bloqueara el bundle,
    // el formulario existiría sin estilos ni comportamiento. Comprobamos que el
    // formulario es funcional (los inputs aceptan texto).
    await page.goto(ADMIN_LOGIN, { waitUntil: 'networkidle' });

    await page.fill('#field-email', 'smoke@example.test');
    await page.fill('#field-password', 'no-importa');

    await expect(page.locator('#field-email')).toHaveValue('smoke@example.test');
    await expect(page.locator('#field-password')).toHaveValue('no-importa');
  });
});

test.describe('superficie real — cabeceras de seguridad', () => {
  for (const path of ['/', ADMIN_LOGIN]) {
    test(`emite las cabeceras de seguridad en ${path}`, async ({ request }) => {
      const response = await request.get(path);

      // `/` es dinámico (lee sesión) pero siempre responde 200.
      expect(response.status()).toBe(200);

      const headers = response.headers();
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['x-frame-options']).toBe('DENY');
      expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(headers['strict-transport-security']).toContain('max-age=31536000');

      const csp = headers['content-security-policy'] ?? '';
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("form-action 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      // El servidor de esta suite sirve HTTP: NO debe forzar el upgrade a HTTPS
      // (rompería los assets locales — regresión Devin #92).
      expect(csp).not.toContain('upgrade-insecure-requests');
    });
  }
});
