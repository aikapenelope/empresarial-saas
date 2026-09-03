import React from 'react';
import Link from 'next/link';

export default function HomePage() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}>
      <div style={{ maxWidth: '720px', border: '1px solid #27272a', borderRadius: '1rem', padding: '3rem', backgroundColor: '#18181b', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
        <span style={{ display: 'inline-block', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.875rem', fontWeight: 600, backgroundColor: '#22c55e20', color: '#4ade80', marginBottom: '1.5rem' }}>
          🚀 Módulo 1 Activo: Finance & Customer CRM Core
        </span>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, margin: '0 0 1rem 0', letterSpacing: '-0.025em' }}>
          Empresarial SaaS ERP
        </h1>
        <p style={{ fontSize: '1.125rem', color: '#a1a1aa', margin: '0 0 2rem 0', lineHeight: 1.6 }}>
          Plataforma ERP multi-tenant de alto rendimiento construida con <strong>Payload CMS 3.x</strong>, <strong>Next.js 15</strong> y <strong>Supabase</strong>. Gestión de Cuentas por Cobrar (CxC), Facturación bimonetaria USD/Bs, Abonos y CRM con cobranza directa por WhatsApp.
        </p>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/admin"
            style={{ display: 'inline-flex', alignItems: 'center', padding: '0.75rem 1.75rem', borderRadius: '0.5rem', backgroundColor: '#3b82f6', color: '#ffffff', textDecoration: 'none', fontWeight: 600, fontSize: '1rem' }}
          >
            Acceder al Panel Admin
          </Link>
          <a
            href="https://github.com/aikapenelope/empresarial-saas"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', padding: '0.75rem 1.75rem', borderRadius: '0.5rem', border: '1px solid #3f3f46', color: '#e4e4e7', textDecoration: 'none', fontWeight: 600, fontSize: '1rem' }}
          >
            Ver Repositorio en GitHub
          </a>
        </div>
      </div>
    </main>
  );
}
