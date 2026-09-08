import React from 'react';
import { Zap, ArrowRightLeft } from 'lucide-react';
import { cn } from '@/utilities/cn';

interface QuoteFunnelProps {
  quotes: Array<{ status: string; totalUSD?: number | string | null }>;
  tenantSlug: string;
}

interface Segment {
  key: string;
  label: string;
  barClass: string;
}

/** Embudo visual cotización→factura (Sprint 36). Server-compatible: divs puros. */
const SEGMENTS: Segment[] = [
  { key: 'draft', label: 'Borrador', barClass: 'bg-muted-foreground/50' },
  { key: 'sent', label: 'Enviada', barClass: 'bg-amber-500' },
  { key: 'accepted', label: 'Aceptada', barClass: 'bg-emerald-500' },
  { key: 'converted', label: 'Convertida', barClass: 'bg-chart-2' },
  { key: 'rejected', label: 'Rechazada', barClass: 'bg-rose-500' },
  { key: 'expired', label: 'Expirada', barClass: 'bg-muted-foreground/25' },
];

/**
 * Mini-funnel de cotizaciones: composición por estado + tasa de conversión
 * (aceptadas + convertidas sobre el total). Pieza distintiva del módulo
 * comercial bajo el mismo design system.
 */
export function QuoteFunnel({ quotes, tenantSlug }: QuoteFunnelProps) {
  const counts = new Map<string, number>();
  for (const q of quotes) {
    counts.set(q.status, (counts.get(q.status) ?? 0) + 1);
  }

  const total = quotes.length;
  const won = (counts.get('accepted') ?? 0) + (counts.get('converted') ?? 0);
  const conversionPct = total > 0 ? (won / total) * 100 : 0;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">Embudo Comercial</h2>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <ArrowRightLeft className="h-3 w-3" aria-hidden="true" />
          Conversión:{' '}
          <span
            className={cn(
              'font-mono font-bold tabular-nums',
              conversionPct >= 50
                ? 'text-emerald-600 dark:text-emerald-400'
                : conversionPct >= 25
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-rose-600 dark:text-rose-400',
            )}
          >
            {conversionPct.toFixed(0)}%
          </span>
        </span>
      </div>

      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`Embudo de cotizaciones: ${SEGMENTS.map((s) => `${s.label} ${counts.get(s.key) ?? 0}`).join(', ')} sobre ${total}`}
      >
        {SEGMENTS.map((s) => {
          const count = counts.get(s.key) ?? 0;
          if (count <= 0 || total <= 0) return null;
          return (
            <div
              key={s.key}
              className={s.barClass}
              style={{ width: `${(count / total) * 100}%` }}
              title={`${s.label}: ${count}`}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {SEGMENTS.map((s) => (
          <span
            key={s.key}
            className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
          >
            <span className={cn('h-2 w-2 rounded-full', s.barClass)} aria-hidden="true" />
            {s.label} ({counts.get(s.key) ?? 0})
          </span>
        ))}
        <a
          href={`/${tenantSlug}/erp/quotes/quick`}
          className="ml-auto text-[11px] font-semibold text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
        >
          + Cotización rápida
        </a>
      </div>
    </div>
  );
}
