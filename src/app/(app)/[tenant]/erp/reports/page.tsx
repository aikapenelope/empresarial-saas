import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Download, FileText, Scale, Boxes } from 'lucide-react';
import { getTenantBySlug, getSalesBookReport, getCustomersWithDebt } from '@/utilities/erpData';
import { businessListFiltersSchema } from '@/utilities/erpValidation';
import { formatUSD, formatVES } from '@/components/erp/format';
import { ErpPageHeader } from '@/components/erp/ErpPageHeader';
import { KpiCard } from '@/components/erp/KpiCard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';

interface PageProps {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}

export default async function ReportsPage({ params, searchParams }: PageProps) {
  const { tenant: tenantSlug } = await params;
  const sp = await searchParams;

  let tenant: Awaited<ReturnType<typeof getTenantBySlug>> = null;
  try {
    tenant = await getTenantBySlug(tenantSlug);
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  if (!tenant) {
    notFound();
  }

  const q = businessListFiltersSchema.parse(sp);

  let salesBook, customers;
  try {
    [salesBook, customers] = await Promise.all([
      getSalesBookReport(tenant.id, { from: q.from, to: q.to }),
      getCustomersWithDebt(tenant.id),
    ]);
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  // Cartera (aging) del inquilino — los campos ledger los mantienen los hooks
  // transaccionales, así que el agregado es una suma simple sobre el padrón.
  let debtUSD = 0;
  let overdueUSD = 0;
  let debtors = 0;
  for (const c of customers) {
    const d = Number(c.currentDebtUSD) || 0;
    debtUSD += d;
    overdueUSD += Number(c.overdueDebtUSD) || 0;
    if (d > 0) debtors += 1;
  }

  const exportQuery = new URLSearchParams();
  if (q.from) exportQuery.set('from', q.from);
  if (q.to) exportQuery.set('to', q.to);
  const exportQs = exportQuery.toString() ? `?${exportQuery.toString()}` : '';

  const preview = salesBook.entries.slice(0, 25);

  return (
    <div className="space-y-6">
      <ErpPageHeader
        title="Reportes & Exports"
        description="Libro de Ventas y exports del período. Los VES usan la tasa snapshot de cada documento — históricos estables."
        breadcrumbHref={`/${tenantSlug}/erp`}
        section="Reportes"
      />

      {/* Filtro del período (GET server-side) */}
      <form
        method="get"
        className="rounded-xl border border-border bg-card p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs"
      >
        <div>
          <label className="block font-semibold text-foreground mb-1" htmlFor="reports-from">
            Desde
          </label>
          <Input type="date" id="reports-from" name="from" defaultValue={q.from || ''} />
        </div>
        <div>
          <label className="block font-semibold text-foreground mb-1" htmlFor="reports-to">
            Hasta
          </label>
          <Input type="date" id="reports-to" name="to" defaultValue={q.to || ''} />
        </div>
        <div className="flex items-end gap-2 sm:col-span-2">
          <Button type="submit" size="sm">
            Aplicar período
          </Button>
          <Button type="button" variant="outline" size="sm" asChild>
            <a href={`/${tenantSlug}/erp/reports`}>Limpiar</a>
          </Button>
        </div>
      </form>

      {/* KPIs del Libro de Ventas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard title="Facturas del Período" valueUSD={String(salesBook.totals.count)} icon={FileText} />
        <KpiCard title="Facturado (USD)" valueUSD={salesBook.totals.totalUSD} icon={FileText} />
        <KpiCard
          title="Facturado (VES histórico)"
          valueUSD={formatUSD(0).replace('$0.00', '') + 'Bs.'}
          icon={FileText}
          description={formatVES(salesBook.totals.totalVES)}
        />
      </div>

      {/* Libro de Ventas — preview + export */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            Libro de Ventas {q.from || q.to ? `(${q.from || 'inicio'} → ${q.to || 'hoy'})` : '(todo el histórico)'}
          </h2>
          <Button variant="outline" size="sm" asChild>
            <a href={`/${tenantSlug}/erp/reports/sales-book/export${exportQs}`}>
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Exportar CSV
            </a>
          </Button>
        </div>

        {preview.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-10">
            No hay facturas emitidas en el período seleccionado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Fecha</TableHead>
                  <TableHead>Factura</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Condición</TableHead>
                  <TableHead className="text-right">Total USD</TableHead>
                  <TableHead className="text-right">Total VES</TableHead>
                  <TableHead className="text-right">Tasa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.map((e, idx) => (
                  <TableRow key={`${e.invoiceNumber}-${idx}`}>
                    <TableCell className="text-muted-foreground text-[11px]">
                      {new Date(e.date).toLocaleDateString('es-VE')}
                    </TableCell>
                    <TableCell className="font-mono font-bold">{e.invoiceNumber}</TableCell>
                    <TableCell>{e.customerName}</TableCell>
                    <TableCell className="capitalize text-muted-foreground text-[11px]">
                      {e.paymentTerms === 'cash' ? 'Contado' : 'Crédito'}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatUSD(e.totalUSD)}</TableCell>
                    <TableCell className="text-right font-mono">{formatVES(e.totalVES)}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {formatUSD(e.rate)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {salesBook.entries.length > preview.length && (
          <p className="p-3 text-[11px] text-muted-foreground border-t border-border">
            Mostrando {preview.length} de {salesBook.entries.length} — el export incluye todas.
          </p>
        )}
      </div>

      {/* Exports de cartera y kardex */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">Cartera por Antigüedad</h2>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Padrón completo con deuda, vencida y buckets de antigüedad por cliente.
          </p>
          <div className="flex items-center gap-4 text-xs font-mono tabular-nums">
            <span>
              Deuda: <strong className="text-foreground">{formatUSD(debtUSD)}</strong>
            </span>
            <span className="text-rose-600 dark:text-rose-400">
              Vencida: {formatUSD(overdueUSD)}
            </span>
            <span className="text-muted-foreground">{debtors} deudor(es)</span>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href={`/${tenantSlug}/erp/reports/aging/export`}>
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Exportar cartera CSV
            </a>
          </Button>
        </Card>

        <Card className="rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">Kardex de Inventario</h2>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Ledger completo de movimientos con sus filtros. Para vista filtrada e interactiva usa la
            <Link
              href={`/${tenantSlug}/erp/inventory/kardex`}
              className="mx-1 underline decoration-border underline-offset-2 hover:decoration-foreground"
            >
              vista del Kardex
            </Link>
            .
          </p>
          <Button variant="outline" size="sm" asChild>
            <a href={`/${tenantSlug}/erp/reports/kardex/export${exportQs}`}>
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Exportar kardex CSV {q.from || q.to ? '(período)' : '(completo)'}
            </a>
          </Button>
        </Card>
      </div>
    </div>
  );
}
