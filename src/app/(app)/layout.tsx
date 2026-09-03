import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Empresarial SaaS | ERP & B2B Platform',
  description: 'Enterprise Resource Planning & Multi-Tenant Commerce SaaS built with Payload CMS 3.x and Supabase.',
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', backgroundColor: '#09090b', color: '#f4f4f5' }}>
        {children}
      </body>
    </html>
  );
}
