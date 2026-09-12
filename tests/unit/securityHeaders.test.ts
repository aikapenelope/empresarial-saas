import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';

/**
 * ─── Cabeceras de seguridad (Sprint R7 · S1-2) ──────────────────────────────
 *
 * Fija el contrato de `next.config.headers()`: la CSP (vía oficial de Next.js
 * sin nonce) y las cabeceras previas. Evita que un refactor elimine el
 * endurecimiento sin que nadie lo note.
 */

type SecurityHeaders = Awaited<ReturnType<NonNullable<typeof nextConfig.headers>>>;

/** Valor de la cabecera Content-Security-Policy del resultado de `headers()`. */
function cspFrom(headers: SecurityHeaders | undefined): string {
  const entry = headers?.[0]?.headers.find((h) => h.key === 'Content-Security-Policy');
  return String(entry?.value ?? '');
}

describe('cabeceras de seguridad (R7)', () => {
  it('emite una CSP con las directivas endurecidas', async () => {
    const value = cspFrom(await nextConfig.headers?.());
    expect(value).toBeTruthy();
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

  it('con S3_ENDPOINT añade SÓLO su origen a img-src (Devin #92)', async () => {
    const original = process.env.S3_ENDPOINT;
    process.env.S3_ENDPOINT = 'https://abc.r2.cloudflarestorage.com/bucket';
    try {
      const csp = cspFrom(await nextConfig.headers?.());
      // Sin el origen del storage, el admin no podría mostrar los previews.
      expect(csp).toContain('https://abc.r2.cloudflarestorage.com');
      // Sólo el ORIGEN (nunca el path completo del endpoint).
      expect(csp).not.toContain('cloudflarestorage.com/bucket');
    } finally {
      if (original === undefined) delete process.env.S3_ENDPOINT;
      else process.env.S3_ENDPOINT = original;
    }
  });

  it('sin S3_ENDPOINT, img-src se limita a self/blob/data', async () => {
    const original = process.env.S3_ENDPOINT;
    delete process.env.S3_ENDPOINT;
    try {
      const csp = cspFrom(await nextConfig.headers?.());
      expect(csp).toContain("img-src 'self' blob: data:;");
    } finally {
      if (original !== undefined) process.env.S3_ENDPOINT = original;
    }
  });
});
