import { describe, expect, it } from 'vitest';
import { computeCsrfOrigins } from '@/utilities/csrfOrigins';

/**
 * ─── Orígenes CSRF seguros por defecto (Sprint R7 · Devin #92) ──────────────
 *
 * Payload NO aplica allowlist cuando `csrf` está vacío. Estos tests fijan que el
 * allowlist por defecto YA NO queda vacío en un despliegue real, y que incluye el
 * origen del propio deployment (VERCEL_URL) para no romper los previews.
 */

describe('computeCsrfOrigins (R7 · Devin #92)', () => {
  it('deriva orígenes seguros de la configuración de despliegue', () => {
    const origins = computeCsrfOrigins({
      PUBLIC_BASE_URL: 'https://erp.midominio.com/',
      NEXT_PUBLIC_SITE_URL: 'https://midominio.com',
      VERCEL_URL: 'empresarial-saas-git-fix-x.vercel.app',
    });

    expect(origins).toContain('https://erp.midominio.com'); // slash final normalizado
    expect(origins).toContain('https://midominio.com');
    expect(origins).toContain('https://empresarial-saas-git-fix-x.vercel.app');
  });

  it('el allowlist NO queda vacío con la configuración de un despliegue real', () => {
    const origins = computeCsrfOrigins({
      PUBLIC_BASE_URL: 'https://erp.midominio.com',
    });

    // No vacío ⇒ Payload SÍ aplica la allowlist (protección activa por defecto).
    expect(origins.length).toBeGreaterThan(0);
  });

  it('acepta orígenes extra (coma-separados) y deduplica', () => {
    const origins = computeCsrfOrigins({
      PUBLIC_BASE_URL: 'https://erp.midominio.com',
      PAYLOAD_CSRF_ORIGINS: 'https://otro.example.com, https://erp.midominio.com ,,',
    });

    expect(origins).toEqual(['https://erp.midominio.com', 'https://otro.example.com']);
  });

  it('canonicaliza cada valor a su ORIGEN: descarta path, slash y espacios (Devin #92)', () => {
    const origins = computeCsrfOrigins({
      PUBLIC_BASE_URL: 'https://erp.midominio.com/erp/',
      PAYLOAD_CSRF_ORIGINS:
        '  https://otro.example.com/path?x=1 , app.example.com , https://tercero.example.com:8443/',
    });

    expect(origins).toEqual([
      'https://erp.midominio.com',
      'https://otro.example.com',
      'https://tercero.example.com:8443',
    ]);
    // Un valor SIN esquema es inválido (nunca coincidiría con el header Origin).
    expect(origins).not.toContain('app.example.com');
  });

  it('sin ninguna variable devuelve vacío (sólo entornos sin configuración)', () => {
    expect(computeCsrfOrigins({})).toEqual([]);
  });
});
