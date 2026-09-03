import React from 'react';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Empresarial SaaS | ERP & B2B Platform',
  description: 'Enterprise Resource Planning & Multi-Tenant Commerce SaaS built with Payload CMS 3.x and Supabase.',
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
