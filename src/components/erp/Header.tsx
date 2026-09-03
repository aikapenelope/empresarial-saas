import React from 'react';
import Link from 'next/link';
import { TrendingUp, Plus, ShieldCheck } from 'lucide-react';
import type { ExchangeRates } from '@/lib/exchange-rate';

interface HeaderProps {
  tenantSlug: string;
  rates: ExchangeRates;
}

export function Header({ tenantSlug, rates }: HeaderProps) {
  return (
    <header className="h-16 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-20">
      {/* Tasa de Cambio en Vivo */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-zinc-400 font-medium">BCV Oficial:</span>
          <span className="font-semibold text-zinc-100">
            {rates.bcv ? `Bs. ${rates.bcv.toFixed(2)}` : 'Sincronizando...'}
          </span>
        </div>

        {rates.binance && (
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs">
            <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-zinc-400 font-medium">Binance P2P:</span>
            <span className="font-semibold text-zinc-100">Bs. {rates.binance.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* Acciones Rápidas y Enlace de Gestión */}
      <div className="flex items-center gap-3">
        <Link
          href={`/admin/collections/invoices/create`}
          target="_blank"
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-500/20 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Nueva Factura</span>
        </Link>

        <div className="flex items-center gap-2 pl-3 border-l border-zinc-800 text-xs text-zinc-400">
          <ShieldCheck className="w-4 h-4 text-blue-400" />
          <span className="font-mono bg-zinc-900 px-2 py-1 rounded text-zinc-300">/{tenantSlug}</span>
        </div>
      </div>
    </header>
  );
}
