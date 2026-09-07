'use client';

import { useMemo } from 'react';
import { Pie, PieChart } from 'recharts';
import { Banknote, CreditCard, Smartphone, Globe } from 'lucide-react';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import { formatUSD } from '../format';
import { cn } from '@/utilities/cn';

interface DeclaredTotalsLike {
  cashUSD?: number | string | null;
  cashVES?: number | string | null;
  posVES?: number | string | null;
  pagoMovilVES?: number | string | null;
  zelleUSD?: number | string | null;
  binanceUSD?: number | string | null;
}

interface MethodMixCardProps {
  /** Totales declarados de los cierres de caja a agregar. */
  declared: DeclaredTotalsLike[];
  /** Tasa efectiva VES/USD del inquilino para homogeneizar a USD. */
  effectiveRate: number;
  className?: string;
}

const num = (v: number | string | null | undefined) => Number(v) || 0;

/**
 * Mix de métodos de pago (Sprint 36): donut monocromo con la recaudación
 * agregada de los arqueos, homogeneizada a USD con la tasa efectiva.
 * Pieza distintiva del módulo de tesorería.
 */
export function MethodMixCard({ declared, effectiveRate, className }: MethodMixCardProps) {
  const buckets = useMemo(() => {
    const rate = effectiveRate > 0 ? effectiveRate : 1;
    const cash = declared.reduce((acc, d) => acc + num(d.cashUSD) + num(d.cashVES) / rate, 0);
    const pos = declared.reduce((acc, d) => acc + num(d.posVES) / rate, 0);
    const pagoMovil = declared.reduce((acc, d) => acc + num(d.pagoMovilVES) / rate, 0);
    const digital = declared.reduce((acc, d) => acc + num(d.zelleUSD) + num(d.binanceUSD), 0);
    const total = cash + pos + pagoMovil + digital;

    return [
      { key: 'cash', label: 'Efectivo', icon: Banknote, value: cash },
      { key: 'pos', label: 'Punto POS', icon: CreditCard, value: pos },
      { key: 'pagoMovil', label: 'Pago Móvil', icon: Smartphone, value: pagoMovil },
      { key: 'digital', label: 'Zelle / Binance', icon: Globe, value: digital },
    ].map((b) => ({ ...b, sharePct: total > 0 ? (b.value / total) * 100 : 0 }));
  }, [declared, effectiveRate]);

  const totalUSD = buckets.reduce((acc, b) => acc + b.value, 0);

  const chartConfig = {
    cash: { label: 'Efectivo', color: 'var(--chart-1)' },
    pos: { label: 'Punto POS', color: 'var(--chart-2)' },
    pagoMovil: { label: 'Pago Móvil', color: 'var(--chart-3)' },
    digital: { label: 'Zelle / Binance', color: 'var(--chart-4)' },
  } satisfies ChartConfig;

  const chartData = buckets.map((b) => ({ key: b.key, value: Number(b.value.toFixed(2)) }));

  return (
    <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-foreground">Mix de Métodos de Pago</h2>
        <span className="text-xs text-muted-foreground">
          Agregado de {declared.length} arqueo(s) · {formatUSD(totalUSD)}
        </span>
      </div>

      {totalUSD <= 0 ? (
        <p className="text-xs text-muted-foreground py-8 text-center">
          Sin arqueos registrados todavía.
        </p>
      ) : (
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <ChartContainer className="aspect-square h-36 w-36 shrink-0" config={chartConfig}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="key"
                innerRadius={42}
                outerRadius={68}
                strokeWidth={2}
                isAnimationActive={false}
              />
            </PieChart>
          </ChartContainer>

          <ul className="flex-1 w-full space-y-1.5">
            {buckets.map((b) => (
              <li key={b.key} className="flex items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <b.icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {b.label}
                </span>
                <span className="inline-flex items-baseline gap-2 font-mono tabular-nums">
                  <span className="font-semibold text-foreground">{formatUSD(b.value)}</span>
                  <span className="text-[11px] text-muted-foreground">{b.sharePct.toFixed(0)}%</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
