'use client';

/**
 * ─── Skeletons isomórficos por ruta (Implementaciones Estructurales, item 14) ─
 *
 * Cada ruta ERP tiene un `loading.tsx` de 3-6 líneas que compone uno de estos
 * skeletons: las formas replican el layout real de la vista (header + KPIs +
 * filtros + tabla / detalle / dashboard) para que la carga no produzca salto
 * de layout (CLS≈0) ni parpadeo en respuestas rápidas (ver `Delayed`).
 *
 * Marcados como cliente porque `Delayed` necesita efectos; el markup es puro
 * y usa solo tokens del design system (bg-muted, border-border, rounded-xl).
 */

import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Anti-flash (patrón NN/g): no muestra el skeleton si la respuesta llega en
 * <200 ms — debajo de ese umbral el parpadeo molesta más que la espera.
 */
export function Delayed({ children, delayMs = 200 }: { children: ReactNode; delayMs?: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  if (!visible) return null;
  return <>{children}</>;
}

const bar = 'rounded bg-muted dark:bg-muted/50';

/** Fila de KPIs (2 col móvil / 4 col desktop, misma forma que KpiCard). */
function KpiRow({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
          <div className={cn(bar, 'h-3 w-20')} />
          <div className={cn(bar, 'h-6 w-28')} />
        </div>
      ))}
    </div>
  );
}

/** Barra de filtros (misma forma que BusinessFiltersBar: 4 controles + botones). */
function FiltersBar() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 rounded-xl border border-border bg-card p-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <div className={cn(bar, 'h-3 w-16')} />
          <div className={cn(bar, 'h-9 w-full rounded-lg')} />
        </div>
      ))}
    </div>
  );
}

/**
 * Forma de las vistas de lista (facturas, pedidos, inventario, …): header,
 * fila de KPIs, barra de filtros y tabla de N filas.
 */
export function ListSkeleton({ rows = 8, kpis = 4, filters = true }: { rows?: number; kpis?: number; filters?: boolean }) {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden="true">
      <div className="space-y-2">
        <div className={cn(bar, 'h-6 w-56')} />
        <div className={cn(bar, 'h-3 w-80')} />
      </div>
      <KpiRow count={kpis} />
      {filters && <FiltersBar />}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="h-10 border-b border-border bg-muted/50 px-4 flex items-center gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={cn(bar, 'h-3 flex-1')} />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-12 border-b border-border/60 px-4 flex items-center gap-4 last:border-b-0">
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className={cn(bar, 'h-3 flex-1', j === 0 && 'max-w-32')} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Forma de las vistas de detalle (factura, pedido, cliente, remisión): título,
 * tarjeta de resumen y tabla de líneas — promueve el shape del antiguo
 * `invoices/[id]/loading.tsx` a componente reutilizable.
 */
export function DetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden="true">
      <div className="space-y-2">
        <div className={cn(bar, 'h-6 w-64')} />
        <div className={cn(bar, 'h-3 w-48')} />
      </div>
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className={cn(bar, 'h-6 w-48')} />
        <div className={cn(bar, 'h-4 w-80')} />
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="h-10 border-b border-border bg-muted/50" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 border-b border-border/60 last:border-b-0" />
        ))}
      </div>
    </div>
  );
}
