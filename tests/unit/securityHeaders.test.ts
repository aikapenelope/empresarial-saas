import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';

/**
 * ─── Cabeceras de seguridad (Sprint R7 · S1-2) ──────────────────────────────
 *
 * Fija el contrato de `next.config.headers()`: la CSP (vía oficial de Next.js
 * sin nonce) y las cabeceras previas. Evita que un refactor elimine el
 * endurecimiento sin que nadie lo note.
 */

describe('cabeceras de seguridad (R7)', () => {
  it('emite una CSP con las directivas endurecidas', async () => {
    const headers = (await nextConfig.headers?.()) ?? [];
    const csp = headers[0]?.headers.find((h) => h.key === 'Content-Security-Policy');
    expect(csp).toBeDefined();

    const value = String(csp?.value);
    expect(value).toContain("default-src 'self'");
    expect(value).toContain("script-src 'self' 'unsafe-inline'");
    expect(value).toContain("style-src 'self' 'unsafe-inline'");
    expect(value).toContain("object-src 'none'");
    expect(value).toContain("base-uri 'self'");
    expect(value).toContain("form-action 'self'");
    expect(value).toContain("frame-ancestors 'none'");
  });

  it('conserva las cabeceras previas', async () => {
    const headers = (await nextConfig.headers?.()) ?? [];
    const keys = headers[0]?.headers.map((h) => h.key) ?? [];
    expect(keys).toContain('X-Content-Type-Options');
    expect(keys).toContain('X-Frame-Options');
    expect(keys).toContain('Referrer-Policy');
    expect(keys).toContain('Strict-Transport-Security');
  });
});
