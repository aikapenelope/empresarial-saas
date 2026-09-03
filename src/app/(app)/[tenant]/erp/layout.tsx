import React from 'react';
import { Sidebar } from '@/components/erp/Sidebar';
import { Header } from '@/components/erp/Header';
import { getLiveExchangeRates } from '@/lib/exchange-rate';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{
    tenant: string;
  }>;
}

export default async function ERPLayout({ children, params }: LayoutProps) {
  const { tenant } = await params;
  const rates = await getLiveExchangeRates();

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      <Sidebar tenantSlug={tenant} tenantName={tenant.toUpperCase()} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header tenantSlug={tenant} rates={rates} />
        <main className="flex-1 p-6 md:p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
