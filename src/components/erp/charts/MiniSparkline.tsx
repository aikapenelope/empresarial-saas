'use client';

import { useId } from 'react';
import { Area, AreaChart } from 'recharts';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';

interface MiniSparklineProps {
  /** Serie de valores en orden temporal (se renderiza tal cual). */
  data: number[];
  /** Token de color del design system: --chart-1 … --chart-5. */
  colorVar?: string;
  className?: string;
  'aria-label'?: string;
}

/**
 * Sparkline decorativa (sin ejes ni tooltip) al estilo Dashboard 4.
 * Color por token (`--chart-N`) para ser bimodal gratis.
 */
export function MiniSparkline({
  data,
  colorVar = 'var(--chart-2)',
  className,
  'aria-label': ariaLabel,
}: MiniSparklineProps) {
  const chartUid = useId().replace(/:/g, '');
  const gradientId = `spark-grad-${chartUid}`;
  const chartConfig = {
    value: { label: 'Serie', color: colorVar },
  } satisfies ChartConfig;

  const rows = data.map((value, i) => ({ i, value }));

  return (
    <ChartContainer
      className={className ?? 'h-10 w-full'}
      config={chartConfig}
      role="img"
      aria-label={ariaLabel}
    >
      <AreaChart data={rows} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--color-value)"
          strokeWidth={1.75}
          fill={`url(#${gradientId})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}
