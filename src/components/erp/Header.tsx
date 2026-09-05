'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Building2, ChevronDown, Settings, Menu, X, ExternalLink } from 'lucide-react';
import type { Tenant } from '@/payload-types';
import { CurrencyTicker } from './CurrencyTicker';

interface HeaderProps {
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
  onMenuToggle?: () => void;
  isMobileMenuOpen?: boolean;
}

export function Header({
  currentTenant,
  availableTenants,
  rates,
  onMenuToggle,
  isMobileMenuOpen,
}: HeaderProps) {
  const [isTenantDropdownOpen, setIsTenantDropdownOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-800/80 bg-slate-950/80 px-4 sm:px-6 backdrop-blur-md">
      <div className="flex items-center gap-3">
        {/* Mobile Menu Toggle Button */}
        {onMenuToggle && (
          <button
            onClick={onMenuToggle}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-white lg:hidden"
            aria-label="Alternar menú"
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        )}

        {/* Tenant Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsTenantDropdownOpen(!isTenantDropdownOpen)}
            className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-left text-sm font-medium text-slate-200 transition-all hover:border-slate-700 hover:bg-slate-900"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded bg-indigo-600/20 text-indigo-400">
              <Building2 className="h-3.5 w-3.5" />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-xs leading-none text-white max-w-[140px] sm:max-w-[200px] truncate">
                {currentTenant.name}
              </span>
              <span className="text-[10px] text-slate-400 font-mono leading-tight">
                {currentTenant.slug}
              </span>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400 ml-1" />
          </button>

          {isTenantDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsTenantDropdownOpen(false)}
              />
              <div className="absolute left-0 mt-2 w-64 rounded-xl border border-slate-800 bg-slate-900/95 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-md z-50">
                <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800/80 mb-1">
                  Empresas Disponibles
                </div>
                <div className="max-h-56 overflow-y-auto space-y-0.5">
                  {availableTenants.map((t) => (
                    <Link
                      key={t.id}
                      href={`/${t.slug}/erp`}
                      onClick={() => setIsTenantDropdownOpen(false)}
                      className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-colors ${
                        t.slug === currentTenant.slug
                          ? 'bg-indigo-600/20 font-semibold text-indigo-300'
                          : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                      }`}
                    >
                      <span className="truncate">{t.name}</span>
                      <span className="text-[10px] font-mono text-slate-400">{t.slug}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Center: Live Currency Ticker */}
      <div className="hidden sm:flex items-center justify-center">
        <CurrencyTicker rates={rates} />
      </div>

      {/* Right Side: Quick Links & Admin */}
      <div className="flex items-center gap-2">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:border-slate-700 hover:bg-slate-900 hover:text-white"
        >
          <Settings className="h-3.5 w-3.5 text-slate-400" />
          <span className="hidden md:inline">Panel Admin</span>
          <ExternalLink className="h-3 w-3 text-slate-400" />
        </Link>
      </div>
    </header>
  );
}
