import React from 'react';
import Link from 'next/link';
import { cn } from '@/utilities/cn';
import { Badge } from './Badge';

interface KpiCardProps {
  title: string;
  valueUSD: number | string;
  valueVES?: number | string;
  icon: React.ElementType;
  badgeText?: string;
  badgeVariant?: 'emerald' | 'amber' | 'rose' | 'indigo' | 'slate' | 'blue';
  description?: string;
  href?: string;
  className?: string;
}

export function formatUSD(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatVES(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return 'Bs. 0,00';
  return (
    'Bs. ' +
    new Intl.NumberFormat('es-VE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num)
  );
}

export function KpiCard({
  title,
  valueUSD,
  valueVES,
  icon: Icon,
  badgeText,
  badgeVariant = 'indigo',
  description,
  href,
  className,
}: KpiCardProps) {
  const content = (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border border-slate-800/80 bg-slate-900/60 p-5 backdrop-blur transition-all duration-200 hover:border-slate-700 hover:bg-slate-900/80 hover:shadow-lg hover:shadow-indigo-500/5',
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-2xl font-bold tracking-tight text-white">
              {typeof valueUSD === 'number' ? formatUSD(valueUSD) : valueUSD}
            </h3>
            {badgeText && (
              <Badge variant={badgeVariant} size="sm">
                {badgeText}
              </Badge>
            )}
          </div>
          {valueVES !== undefined && (
            <p className="text-xs font-medium text-emerald-400/90">
              ≈ {typeof valueVES === 'number' ? formatVES(valueVES) : valueVES}
            </p>
          )}
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-800/50 p-2.5 text-slate-300 transition-colors group-hover:border-indigo-500/30 group-hover:bg-indigo-500/10 group-hover:text-indigo-400">
          <Icon className="h-5 w-5" />
        </div>
      </div>

      {description && <p className="mt-3 text-xs text-slate-400 leading-relaxed">{description}</p>}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
