import { withPayload } from '@payloadcms/next/withPayload';
import type { NextConfig } from 'next';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(__filename);

const nextConfig: NextConfig = {
  // Único añadido consciente sobre el template blank oficial v3.88.0:
  // sólo afecta al modo dev (doble render para detectar efectos impuros).
  reactStrictMode: true,
  // Cabeceras de seguridad (Sprint R1 · auditoría 2026-09-10 · P2-S1-05):
  // mitigan clickjacking, MIME-sniffing y fugas de referrer.
  // Sprint R7 (S1-2): se añade Content-Security-Policy por la vía OFICIAL de
  // Next.js (docs/app/guides/content-security-policy, variante sin nonce vía
  // `headers()`). Se elige esa variante — y no la de nonce con `proxy.ts` —
  // porque: (a) el admin de Payload y React usan `style` inline (requieren
  // `style-src 'unsafe-inline'` de todos modos), (b) la variante con nonce
  // fuerza renderizado dinámico y afecta a TODAS las rutas, y (c) no se puede
  // verificar el admin en navegador desde este entorno. Aun así endurece:
  // bloquea orígenes de script externos, <object>, `base-uri`, framing
  // (`frame-ancestors`) y el envío de formularios a terceros.
  async headers() {
    const isDev = process.env.NODE_ENV === 'development';
    const cspHeader = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data:",
      "font-src 'self'",
      `connect-src 'self'${isDev ? ' ws:' : ''}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      // Sólo en producción: en dev (http://localhost) forzaría https en subrecursos.
      ...(isDev ? [] : ['upgrade-insecure-requests']),
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          { key: 'Content-Security-Policy', value: cspHeader },
        ],
      },
    ];
  },
  images: {
    localPatterns: [
      {
        pathname: '/api/media/file/**',
      },
    ],
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    };

    return webpackConfig;
  },
  turbopack: {
    root: path.resolve(dirname),
  },
};

export default withPayload(nextConfig, { devBundleServerPackages: false });
