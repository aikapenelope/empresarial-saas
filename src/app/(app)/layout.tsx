import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Empresarial SaaS · Cendaro ERP',
  description: 'Plataforma ERP Modular Multi-Tenant impulsada por Payload CMS 3.x y Next.js 15',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="antialiased bg-slate-950 text-slate-50 min-h-screen">
        {children}
      </body>
    </html>
  );
}
