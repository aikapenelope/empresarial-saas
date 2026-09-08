'use client';

import React from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Delta, DeltaIcon, DeltaValue } from '@/components/delta';
import { Badge } from './Badge';
import { MiniSparkline } from './charts/MiniSparkline';
import { formatUSD, formatVES } from './format';
import { cn } from '@/utilities/cn';

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
  /** Variación % vs el período anterior (Dashboard 4: Delta con flecha). */
  deltaPct?: number;
  /** Etiqueta del delta, p. ej. "vs 30d previos". */
  deltaLabel?: string;
  /** Serie temporal para la sparkline (misma unidad que valueUSD). */
  sparkline?: number[];
  /** Color de la sparkline: token --chart-N del design system. */
  sparklineColor?: string;
  /** Intención semántica: tiñe el valor principal. */
  tone?: 'default' | 'positive' | 'warning' | 'destructive';
}

const toneValueStyles: Record<NonNullable<KpiCardProps['tone']>, string> = {
  default: 'text-foreground',
  positive: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  destructive: 'text-rose-600 dark:text-rose-400',
};

/**
 * KpiCard canónica del design system (Fase 8 / Sprint 35): Card de shadcn con
 * tokens bimodales, delta opcional al estilo Dashboard 4 y sparkline opcional.
 * Los formatters viven en `./format` (módulo neutro consumible desde RSC).
 */
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
  deltaPct,
  deltaLabel,
  sparkline,
  sparklineColor,
  tone = 'default',
}: KpiCardProps) {
  const content = (
    <Card
      className={cn(
        'group gap-2 rounded-xl p-5 transition-all duration-200',
        'hover:border-muted-foreground/30 hover:shadow-md',
        href && 'cursor-pointer',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
        <div className="rounded-lg border border-border bg-muted/50 p-2 text-muted-foreground transition-colors group-hover:border-foreground/20 group-hover:bg-muted group-hover:text-foreground">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>

      <div className="flex items-baseline gap-2">
        <h3
          className={cn(
            'text-2xl font-bold tracking-tight tabular-nums',
            toneValueStyles[tone],
          )}
        >
          {typeof valueUSD === 'number' ? formatUSD(valueUSD) : valueUSD}
        </h3>
        {badgeText && (
          <span className="pb-0.5">
            <Badge variant={badgeVariant}>{badgeText}</Badge>
          </span>
        )}
      </div>

      {valueVES !== undefined && (
        <p className="text-xs font-medium tabular-nums text-muted-foreground">
          ≈ {typeof valueVES === 'number' ? formatVES(valueVES) : valueVES}
        </p>
      )}

      {typeof deltaPct === 'number' && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Delta value={deltaPct}>
            <DeltaIcon variant="trend" />
            <DeltaValue />
          </Delta>
          {deltaLabel && <span>{deltaLabel}</span>}
        </div>
      )}

      {sparkline && sparkline.length > 1 && (
        <MiniSparkline data={sparkline} colorVar={sparklineColor} aria-label={title} />
      )}

      {description && (
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      )}
    </Card>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
