'use client';

import { useMemo } from 'react';
import { Banknote, CreditCard, Smartphone, Globe, ArrowLeftRight } from 'lucide-react';
import { formatUSD } from '../format';
import { cn } from '@/utilities/cn';

/** Método de pago tal como lo persiste el recibo (tasa snapshot incluida). */
interface PaymentMethodLike {
  method?:
    | 'cash_usd'
    | 'cash_ves'
    | 'pos_ves'
    | 'pago_movil'
    | 'transfer_ves'
    | 'zelle'
    | 'binance'
    | string
    | null;
  currency?: 'USD' | 'VES' | string | null;
  amount?: number | string | null;
  /** Tasa VES/USD aplicada al momento del pago (snapshot, no la vigente). */
  exchangeRate?: number | string | null;
  /** Contravalor USD persistido por el recibo; si falta se deriva del snapshot. */
  amountUSD?: number | string | null;
}

interface MethodMixCardProps {
  /** Pagos recibidos (recaudación real) a agregar por método. */
  payments: Array<{ methods?: PaymentMethodLike[] | null }>;
  className?: string;
}

const num = (v: number | string | null | undefined) => Number(v) || 0;

/** Contravalor USD del método: el persistido, o derivado con SU tasa snapshot. */
function methodUSD(m: PaymentMethodLike): number {
  const persisted = num(m.amountUSD);
  if (persisted > 0) return persisted;
  const amount = num(m.amount);
  if (amount <= 0) return 0;
  if (m.currency === 'USD') return amount;
  const rate = num(m.exchangeRate);
  return rate > 0 ? amount / rate : amount;
}

/** Bucket de agregación por método de pago (recaudación real). */
const BUCKETS = [
  { key: 'cash', methods: ['cash_usd', 'cash_ves'] as const, label: 'Efectivo', icon: Banknote },
  { key: 'pos', methods: ['pos_ves'] as const, label: 'Punto POS', icon: CreditCard },
  { key: 'pagoMovil', methods: ['pago_movil'] as const, label: 'Pago Móvil', icon: Smartphone },
  { key: 'transfer', methods: ['transfer_ves'] as const, label: 'Transferencia', icon: ArrowLeftRight },
  { key: 'digital', methods: ['zelle', 'binance'] as const, label: 'Zelle / Binance', icon: Globe },
] as const;

/**
 * Mix de métodos de pago (Sprint 36 → fix Devin #49): agrega la RECAUDACIÓN
 * REAL de los pagos recibidos (no los conteos físicos del arqueo, que incluyen
 * fondo de apertura) usando el contravalor USD persistido o, en su defecto, la
 * tasa SNAPSHOT de cada método — los totales históricos no cambian cuando la
 * tasa del día se mueve. Transferencias bancarias incluidas.
 */
export function MethodMixCard({ payments, className }: MethodMixCardProps) {
  const buckets = useMemo(() => {
    const totals = new Map<string, number>();
    for (const p of payments) {
      for (const m of p.methods || []) {
        const bucket = BUCKETS.find((b) => (b.methods as readonly string[]).includes(m.method ?? ''));
        if (!bucket) continue;
        totals.set(bucket.key, (totals.get(bucket.key) ?? 0) + methodUSD(m));
      }
    }

    const totalUSD = BUCKETS.reduce((acc, b) => acc + (totals.get(b.key) ?? 0), 0);
    return BUCKETS.map((b) => ({
      ...b,
      value: totals.get(b.key) ?? 0,
      sharePct: totalUSD > 0 ? ((totals.get(b.key) ?? 0) / totalUSD) * 100 : 0,
    }));
  }, [payments]);

  const totalUSD = buckets.reduce((acc, b) => acc + b.value, 0);
  const paymentCount = payments.length;

  return (
    <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-foreground">Mix de Métodos de Pago</h2>
        <span className="text-xs text-muted-foreground">
          Recaudación de {paymentCount} pago(s) · {formatUSD(totalUSD)}
        </span>
      </div>

      {totalUSD <= 0 ? (
        <p className="text-xs text-muted-foreground py-8 text-center">
          Sin pagos registrados todavía.
        </p>
      ) : (
        <ul className="space-y-1.5">
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
      )}
    </div>
  );
}
