'use client';

import React from 'react';
import { formatVES } from './format';

interface CurrencyTickerProps {
  rates: {
    bcv: number | null;
    binance: number | null;
    paralelo: number | null;
    effectiveRate: number;
    source: string;
    lastUpdated?: string;
  };
}

export function CurrencyTicker({ rates }: CurrencyTickerProps) {
  const bcvDisplay = rates.bcv ? formatVES(rates.bcv) : 'Consultando...';
  const binanceDisplay = rates.binance ? formatVES(rates.binance) : null;
  const paraleloDisplay = rates.paralelo ? formatVES(rates.paralelo) : null;

  return (
    <div className="flex items-center gap-3">
      {/* BCV Oficial Pill */}
      <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
        </span>
        <span className="font-semibold tracking-wide uppercase text-[10px] text-emerald-400">BCV Oficial:</span>
        <span className="font-mono font-bold text-white">{bcvDisplay}</span>
      </div>

      {/* Binance P2P / Paralelo (visible en pantallas medianas y superiores) */}
      {binanceDisplay && (
        <div className="hidden lg:flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/60 px-2.5 py-1 text-xs text-slate-300">
          <span className="text-[10px] uppercase font-semibold text-amber-400">Binance:</span>
          <span className="font-mono text-slate-200">{binanceDisplay}</span>
        </div>
      )}

      {paraleloDisplay && (
        <div className="hidden xl:flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/60 px-2.5 py-1 text-xs text-slate-300">
          <span className="text-[10px] uppercase font-semibold text-indigo-400">Paralelo:</span>
          <span className="font-mono text-slate-200">{paraleloDisplay}</span>
        </div>
      )}
    </div>
  );
}
