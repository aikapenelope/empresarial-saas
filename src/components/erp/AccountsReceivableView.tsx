'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Wallet, TriangleAlert, Users, FileText } from 'lucide-react';
import { KpiCard } from './KpiCard';
import { formatUSD } from './format';
import { ErpPageHeader } from './ErpPageHeader';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AgingRow, AgingSummary, VendorAgingRow } from '@/utilities/arAging';

interface AccountsReceivableViewProps {
  tenantId: number;
  tenantSlug: string;
  isVendor: boolean;
  vendors: Array<{ id: number; name: string }>;
  rows: AgingRow[];
  vendorRows: VendorAgingRow[];
  summary: AgingSummary;
  asOf: string;
}

/** Buckets del kardex de cartera con su token de estado funcional. */
const AGING_BUCKETS: Array<{
  key: keyof Pick<
    AgingSummary,
    'currentUSD' | 'bucket1_30' | 'bucket31_60' | 'bucket61_90' | 'bucket90Plus'
  >;
  label: string;
  barClass: string;
}> = [
  { key: 'currentUSD', label: 'Corriente', barClass: 'bg-chart-2' },
  { key: 'bucket1_30', label: '1–30', barClass: 'bg-chart-3' },
  { key: 'bucket31_60', label: '31–60', barClass: 'bg-amber-500' },
  { key: 'bucket61_90', label: '61–90', barClass: 'bg-orange-500' },
  { key: 'bucket90Plus', label: '+90', barClass: 'bg-rose-500' },
];

/**
 * Cartera con antigüedad (Sprint 21 → reskin Sprint 35): saldos abiertos por
 * cliente en buckets 0-30/31-60/61-90/90+ días de vencido. Filtro por vendedor
 * para el canal; drilldown al detalle del cliente. Incluye la barra apilada
 * de composición de la cartera (distribución por bucket).
 */
export function AccountsReceivableView({
  tenantSlug,
  isVendor,
  vendors,
  rows,
  vendorRows,
  summary,
  asOf,
}: AccountsReceivableViewProps) {
  const [vendorFilter, setVendorFilter] = useState<number | 'all' | 'none'>('all');

  const filteredRows = useMemo(() => {
    if (isVendor || vendorFilter === 'all') return rows;
    if (vendorFilter === 'none') return rows.filter((r) => r.vendorId === null);
    return rows.filter((r) => r.vendorId === vendorFilter);
  }, [rows, vendorFilter, isVendor]);

  const filteredSummary = useMemo(() => {
    if (isVendor || vendorFilter === 'all') return summary;
    const filtered = filteredRows;
    const sum = (pick: (r: AgingRow) => number) =>
      Number(filtered.reduce((acc, r) => acc + pick(r), 0).toFixed(2));
    return {
      ...summary,
      totalUSD: sum((r) => r.totalUSD),
      bucket90Plus: sum((r) => r.bucket90Plus),
      overdueUSD: sum((r) => r.overdueUSD),
      customersWithOverdue: filtered.filter((r) => r.overdueUSD > 0).length,
      openInvoiceCount: filtered.reduce((acc, r) => acc + r.invoiceCount, 0),
    };
  }, [filteredRows, summary, isVendor, vendorFilter]);

  const totalForBar = filteredSummary.totalUSD;
  const overdueSharePct =
    totalForBar > 0 ? (filteredSummary.overdueUSD / totalForBar) * 100 : 0;

  return (
    <div className="space-y-6">
      <ErpPageHeader
        title="Cuentas por Cobrar — Antigüedad"
        description={`Saldos abiertos por cliente con días de vencido (corte ${new Date(asOf).toLocaleDateString('es-VE')}).`}
        breadcrumbHref={`/${tenantSlug}/erp`}
        section="Cartera CxC"
        actions={
          !isVendor && vendors.length > 0 ? (
            <Select
              value={String(vendorFilter)}
              onValueChange={(v) =>
                setVendorFilter(v === 'all' ? 'all' : v === 'none' ? 'none' : Number(v))
              }
            >
              <SelectTrigger className="w-full min-w-52 sm:w-fit" size="sm" aria-label="Filtro por vendedor">
                <SelectValue placeholder="Vendedor" />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="all">Todo el canal</SelectItem>
                <SelectItem value="none">Sin vendedor asignado</SelectItem>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={String(v.id)}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : undefined
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total CxC"
          valueUSD={filteredSummary.totalUSD}
          icon={Wallet}
          description={`${filteredSummary.openInvoiceCount} factura(s) abierta(s)`}
          sparklineColor="var(--chart-2)"
        />
        <KpiCard
          title="Vencido +90 días"
          valueUSD={filteredSummary.bucket90Plus}
          icon={TriangleAlert}
          tone="destructive"
        />
        <KpiCard
          title="Vencido total"
          valueUSD={filteredSummary.overdueUSD}
          icon={TriangleAlert}
          tone="warning"
        />
        <KpiCard
          title="Clientes con Vencido"
          valueUSD={String(filteredSummary.customersWithOverdue)}
          icon={Users}
        />
      </div>

      {/* Composición de la cartera: barra apilada por bucket de antigüedad */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">Composición de la Cartera</h2>
          </div>
          <span className="text-xs tabular-nums font-medium text-rose-600 dark:text-rose-400">
            {overdueSharePct.toFixed(1)}% vencido
          </span>
        </div>
        <div
          className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={`Distribución de la cartera por antigüedad: ${AGING_BUCKETS.map(
            (b) => `${b.label} ${((Number(filteredSummary[b.key]) / (totalForBar || 1)) * 100).toFixed(1)}%`,
          ).join(', ')}`}
        >
          {AGING_BUCKETS.map((b) => {
            const value = Number(filteredSummary[b.key]) || 0;
            if (value <= 0 || totalForBar <= 0) return null;
            return (
              <div
                key={b.key}
                className={b.barClass}
                style={{ width: `${(value / totalForBar) * 100}%` }}
                title={`${b.label}: ${((value / totalForBar) * 100).toFixed(1)}%`}
              />
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {AGING_BUCKETS.map((b) => (
            <span key={b.key} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={`h-2 w-2 rounded-full ${b.barClass}`} aria-hidden="true" />
              {b.label}
            </span>
          ))}
        </div>
      </div>

      {/* Tabla por cliente */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">Cartera por Cliente</h2>
          </div>
          <span className="text-xs text-muted-foreground">{filteredRows.length} cliente(s) con saldo</span>
        </div>

        {filteredRows.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-10">
            No hay saldos abiertos con estos filtros.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="text-right">Corriente</TableHead>
                  <TableHead className="text-right">1–30</TableHead>
                  <TableHead className="text-right">31–60</TableHead>
                  <TableHead className="text-right">61–90</TableHead>
                  <TableHead className="text-right">+90</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((r) => (
                  <TableRow key={r.customerId}>
                    <TableCell>
                      <Link
                        href={`/${tenantSlug}/erp/customers/${r.customerId}`}
                        className="font-semibold text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                      >
                        {r.customerName}
                      </Link>
                      <span className="ml-2 text-[10px] text-muted-foreground">{r.invoiceCount} fact.</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.vendorName}</TableCell>
                    <TableCell className="text-right font-mono">{formatUSD(r.currentUSD)}</TableCell>
                    <TableCell className="text-right font-mono">{formatUSD(r.bucket1_30)}</TableCell>
                    <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400">{formatUSD(r.bucket31_60)}</TableCell>
                    <TableCell className="text-right font-mono text-orange-600 dark:text-orange-400">{formatUSD(r.bucket61_90)}</TableCell>
                    <TableCell className="text-right font-mono font-bold text-rose-600 dark:text-rose-400">{formatUSD(r.bucket90Plus)}</TableCell>
                    <TableCell className="text-right font-mono font-bold">{formatUSD(r.totalUSD)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} className="font-semibold">Total</TableCell>
                  <TableCell className="text-right font-mono">{formatUSD(filteredSummary.currentUSD)}</TableCell>
                  <TableCell className="text-right font-mono">{formatUSD(filteredSummary.bucket1_30)}</TableCell>
                  <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400">{formatUSD(filteredSummary.bucket31_60)}</TableCell>
                  <TableCell className="text-right font-mono text-orange-600 dark:text-orange-400">{formatUSD(filteredSummary.bucket61_90)}</TableCell>
                  <TableCell className="text-right font-mono font-bold text-rose-600 dark:text-rose-400">{formatUSD(filteredSummary.bucket90Plus)}</TableCell>
                  <TableCell className="text-right font-mono font-bold">{formatUSD(filteredSummary.totalUSD)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </div>

      {/* Resumen por vendedor */}
      {!isVendor && vendorRows.length > 1 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">Cartera por Vendedor</h2>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="text-right">Corriente</TableHead>
                  <TableHead className="text-right">Vencido</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendorRows.map((v) => (
                  <TableRow key={`${v.vendorId ?? 'none'}`}>
                    <TableCell className="font-semibold">{v.vendorName}</TableCell>
                    <TableCell className="text-right font-mono">{formatUSD(v.currentUSD)}</TableCell>
                    <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400">{formatUSD(v.overdueUSD)}</TableCell>
                    <TableCell className="text-right font-mono font-bold">{formatUSD(v.totalUSD)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
