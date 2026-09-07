import React from 'react';
import Link from 'next/link';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  PackageSearch,
} from 'lucide-react';
import { formatUSD } from '../format';
import { Badge } from '../Badge';
import { cn } from '@/utilities/cn';

/** Entrada estructural del ledger (compatible con los docs de getKardexEntries). */
export interface KardexEntryLike {
  id: number;
  createdAt: string;
  movementType: string;
  reference: string;
  product: number | { name?: string | null } | null;
  sourceWarehouse?: number | { name?: string | null } | null;
  targetWarehouse?: number | { name?: string | null } | null;
  quantity: number | string;
  totalCostUSD?: number | string | null;
  invoice?: number | { id: number } | null;
}

const TYPE_LABELS: Record<string, { label: string; variant: 'slate' | 'emerald' | 'rose' | 'amber' | 'indigo' }> = {
  purchase_in: { label: 'Entrada por Compra', variant: 'emerald' },
  sale_out: { label: 'Salida por Venta', variant: 'rose' },
  sale_return: { label: 'Devolución de Venta', variant: 'emerald' },
  production_consume: { label: 'Consumo Producción', variant: 'amber' },
  production_output: { label: 'Producto Fabricado', variant: 'emerald' },
  transfer: { label: 'Transferencia', variant: 'indigo' },
  adjustment_positive: { label: 'Ajuste (+)', variant: 'emerald' },
  adjustment_negative: { label: 'Ajuste (−)', variant: 'rose' },
  scrap: { label: 'Merma', variant: 'rose' },
};

/** Dirección del movimiento para el signo y el icono del rail. */
function movementDirection(type: string): 'in' | 'out' | 'transfer' {
  if (type === 'transfer') return 'transfer';
  if (
    type === 'purchase_in' ||
    type === 'sale_return' ||
    type === 'production_output' ||
    type === 'adjustment_positive'
  ) {
    return 'in';
  }
  return 'out';
}

const RAIL_STYLES: Record<'in' | 'out' | 'transfer', string> = {
  in: 'bg-emerald-500',
  out: 'bg-rose-500',
  transfer: 'bg-foreground/40',
};

const QUANTITY_STYLES: Record<'in' | 'out' | 'transfer', string> = {
  in: 'text-emerald-600 dark:text-emerald-400',
  out: 'text-rose-600 dark:text-rose-400',
  transfer: 'text-muted-foreground',
};

/**
 * Timeline vertical del Kardex (Sprint 36): feed legible con rail de color por
 * dirección, badge de tipo y flechas de origen→destino. Pieza distintiva del
 * módulo de inventario; sustituye la tabla plana de 8 columnas.
 */
export function KardexTimeline({
  entries,
  tenantSlug,
}: {
  entries: KardexEntryLike[];
  tenantSlug: string;
}) {
  if (entries.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-10">
        No hay movimientos con esos filtros.
      </p>
    );
  }

  return (
    <ol className="relative space-y-0" aria-label="Timeline de movimientos de inventario">
      {entries.map((m, idx) => {
        const typeInfo = TYPE_LABELS[m.movementType] || {
          label: m.movementType,
          variant: 'slate' as const,
        };
        const direction = movementDirection(m.movementType);
        const productName =
          typeof m.product === 'object' && m.product !== null ? m.product.name : `#${m.product}`;
        const sourceName =
          typeof m.sourceWarehouse === 'object' && m.sourceWarehouse !== null
            ? m.sourceWarehouse.name
            : '—';
        const targetName =
          typeof m.targetWarehouse === 'object' && m.targetWarehouse !== null
            ? m.targetWarehouse.name
            : '—';
        const invoiceId =
          typeof m.invoice === 'object' && m.invoice !== null ? m.invoice.id : m.invoice;
        const isLast = idx === entries.length - 1;
        const signedQty =
          direction === 'in' ? `+${m.quantity}` : direction === 'out' ? `−${m.quantity}` : String(m.quantity);

        return (
          <li key={m.id} className="relative flex gap-4 pb-5 last:pb-0">
            {/* Rail temporal */}
            <div className="flex flex-col items-center" aria-hidden="true">
              <span
                className={cn(
                  'mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-foreground',
                )}
              >
                {direction === 'in' ? (
                  <ArrowDownLeft className="h-3.5 w-3.5" />
                ) : direction === 'out' ? (
                  <ArrowUpRight className="h-3.5 w-3.5" />
                ) : (
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                )}
              </span>
              {!isLast && <span className={cn('w-px flex-1', RAIL_STYLES[direction], 'opacity-30')} />}
            </div>

            {/* Contenido del evento */}
            <div className="flex-1 min-w-0 rounded-xl border border-border bg-muted/30 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  {invoiceId ? (
                    <Link
                      href={`/${tenantSlug}/erp/invoices/${invoiceId}`}
                      className="font-mono text-xs font-bold underline decoration-border underline-offset-2 hover:decoration-foreground"
                      title="Ver factura vinculada"
                    >
                      {m.reference}
                    </Link>
                  ) : (
                    <span className="font-mono text-xs font-bold text-foreground">{m.reference}</span>
                  )}
                  <Badge variant={typeInfo.variant} size="sm">
                    {typeInfo.label}
                  </Badge>
                </div>
                <time className="text-[11px] text-muted-foreground" dateTime={m.createdAt}>
                  {new Date(m.createdAt).toLocaleDateString('es-VE')}
                </time>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className="text-sm font-semibold text-foreground truncate">{productName}</p>
                <div className="flex items-baseline gap-3 text-xs">
                  <span className={cn('font-mono font-bold tabular-nums', QUANTITY_STYLES[direction])}>
                    {signedQty}
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {formatUSD(Number(m.totalCostUSD) || 0)}
                  </span>
                </div>
              </div>

              {m.movementType === 'transfer' && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {sourceName} → {targetName}
                </p>
              )}
              {m.movementType !== 'transfer' && sourceName !== '—' && (
                <p className="mt-1 text-[11px] text-muted-foreground">Almacén: {sourceName}</p>
              )}
              {m.movementType !== 'transfer' && sourceName === '—' && targetName !== '—' && (
                <p className="mt-1 text-[11px] text-muted-foreground">Almacén: {targetName}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function KardexEmptyHint() {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
      <PackageSearch className="h-4 w-4" aria-hidden="true" />
      Ajusta los filtros para ver movimientos.
    </div>
  );
}
