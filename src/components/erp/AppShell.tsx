'use client';

import React, { useState } from 'react';
import type { Tenant } from '@/payload-types';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { CommandPalette } from './CommandPalette';

interface AppShellProps {
  currentTenant: Tenant;
  availableTenants: Tenant[];
  rates: {
    bcv: number | null;
    binance: number | null;
    paralelo: number | null;
    effectiveRate: number;
    source: string;
    lastUpdated?: string;
  };
  userRole?: string | null;
  children: React.ReactNode;
}

export function AppShell({
  currentTenant,
  availableTenants,
  rates,
  userRole,
  children,
}: AppShellProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Sidebar */}
      <Sidebar
        tenantSlug={currentTenant.slug}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        userRole={userRole}
      />

      {/* Main Content Column */}
      <div className="flex flex-1 flex-col min-w-0">
        <Header
          currentTenant={currentTenant}
          availableTenants={availableTenants}
          rates={rates}
          isMobileMenuOpen={isMobileMenuOpen}
          onMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        />

        <CommandPalette tenantSlug={currentTenant.slug} />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
