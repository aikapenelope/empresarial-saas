import React from 'react';
import { Scale } from 'lucide-react';
import { formatUSD } from '../format';
import { cn } from '@/utilities/cn';

interface RateSpreadCardProps {
  effectiveRate: number;
  rateSource: string;
  live: {
    bcv?: number | null;
    binance?: number | null;
    paralelo?: number | null;
    lastUpdated?: string;
  };
}

interface SourceRow {
  key: string;
  label: string;
  value?: number | null;
}

/**
 * Spread entre fuentes (Sprint 36): desviación de BCV/Binance/Paralelo contra
 * la tasa efectiva aplicada. Barra horizontal proporcional al valor; la fuente
 * vigente se resalta. Server-compatible (divs puros, sin recharts).
 */
export function RateSpreadCard({ effectiveRate, rateSource, live }: RateSpreadCardProps) {
  const sources: SourceRow[] = [
    { key: 'bcv_oficial', label: 'BCV Oficial', value: live.bcv },
    { key: 'binance_p2p', label: 'Binance P2P', value: live.binance },
    { key: 'dolar_paralelo', label: 'Dólar Paralelo', value: live.paralelo },
  ];

  const values = sources
    .map((s) => s.value)
    .filter((v): v is number => typeof v === 'number' && v > 0);
  const max = Math.max(effectiveRate, ...values, 1);

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">Spread entre Fuentes</h2>
        </div>
        <span className="text-xs text-muted-foreground">
          Desviación contra la tasa efectiva ({formatUSD(effectiveRate)})
        </span>
      </div>

      <ul className="space-y-2.5">
        {sources.map((s) => {
          const inUse = s.key === rateSource;
          const spreadPct =
            typeof s.value === 'number' && s.value > 0 && effectiveRate > 0
              ? ((s.value - effectiveRate) / effectiveRate) * 100
              : null;

          return (
            <li key={s.key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span
                  className={cn(
                    'font-medium',
                    inUse ? 'text-foreground font-semibold' : 'text-muted-foreground',
                  )}
                >
                  {s.label}
                  {inUse && (
                    <span className="ml-2 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
                      en uso
                    </span>
                  )}
                </span>
                <span className="inline-flex items-baseline gap-2 font-mono tabular-nums">
                  <span className={cn('font-semibold', inUse ? 'text-foreground' : 'text-muted-foreground')}>
                    {typeof s.value === 'number' && s.value > 0 ? formatUSD(s.value) : '—'}
                  </span>
                  {spreadPct !== null && Math.abs(spreadPct) >= 0.05 && (
                    <span
                      className={cn(
                        'text-[11px]',
                        spreadPct > 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-emerald-600 dark:text-emerald-400',
                      )}
                    >
                      {spreadPct > 0 ? '+' : ''}
                      {spreadPct.toFixed(1)}%
                    </span>
                  )}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    inUse ? 'bg-foreground' : 'bg-muted-foreground/40',
                  )}
                  style={{ width: `${typeof s.value === 'number' && s.value > 0 ? (s.value / max) * 100 : 0}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
