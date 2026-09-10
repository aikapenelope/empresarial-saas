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
  // mitigan clickjacking, MIME-sniffing y fugas de referrer. La CSP se
  // pospone deliberadamente: requiere inventario de scripts del admin panel
  // de Payload y una CSP a ciegas rompería /admin (documentado en
  // AUDIT-20260910/SPRINTS-REPARACION.md, sprint R4).
  async headers() {
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
