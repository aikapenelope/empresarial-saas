'use client';

import React, { useState } from 'react';
import {
  Users,
  Receipt,
  Trophy,
  FileSpreadsheet,
} from 'lucide-react';
import { formatUSD } from './format';
import { Badge } from './Badge';
import { KpiCard } from './KpiCard';
import { ErpPageHeader } from './ErpPageHeader';
import { Button } from '@/components/ui/button';
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
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { VendorsPageData } from '@/utilities/erpData';

interface VendorsViewProps {
  tenantId: number;
  tenantSlug: string;
  data: VendorsPageData;
}

export function VendorsView({ tenantSlug, data }: VendorsViewProps) {
  const { isVendor, vendors, customers, commissionRows, earnedUSD, pendingUSD } = data;
  const [vendorFilter, setVendorFilter] = useState<number | 'all'>('all');

  const filteredRows =
    vendorFilter === 'all'
      ? commissionRows
      : commissionRows.filter((r) => r.vendorId === vendorFilter);

  const handleExportCsv = () => {
    const lines = [
      'factura,cliente,vendedor,total_usd,estado,comision_usd',
      ...filteredRows.map((r) =>
        [
          r.invoiceNumber,
          `"${r.customerName.replace(/"/g, '""')}"`,
          `"${r.vendorName.replace(/"/g, '""')}"`,
          r.totalUSD,
          r.status,
          r.commissionUSD,
        ].join(','),
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comisiones-${tenantSlug}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <ErpPageHeader
        title={isVendor ? 'Mi Canal de Ventas' : 'Vendedores & Comisiones'}
        description={`Comisiones derivadas de facturas: ${formatUSD(earnedUSD)} ganadas (pagadas) · ${formatUSD(pendingUSD)} pendientes (emitidas).`}
        breadcrumbHref={`/${tenantSlug}/erp`}
        section={isVendor ? 'Mi Cartera & Comisiones' : 'Vendedores & Comisiones'}
        actions={
          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            Exportar Comisiones
          </Button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Comisiones Ganadas"
          valueUSD={earnedUSD}
          icon={Trophy}
          tone="positive"
          description="Facturas pagadas"
        />
        <KpiCard
          title="Comisiones Pendientes"
          valueUSD={pendingUSD}
          icon={Receipt}
          tone="warning"
          description="Facturas emitidas / parciales"
        />
        <KpiCard
          title="Cartera Asignada"
          valueUSD={String(customers.length)}
          icon={Users}
          description="Cliente(s)"
        />
      </div>

      {/* Cartera de clientes */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Cartera de Clientes</h2>
          {!isVendor && vendors.length > 0 && (
            <Select
              value={String(vendorFilter)}
              onValueChange={(v) => setVendorFilter(v === 'all' ? 'all' : Number(v))}
            >
              <SelectTrigger className="w-full min-w-48 sm:w-fit" size="sm" aria-label="Filtro por vendedor">
                <SelectValue placeholder="Vendedor" />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="all">Todos los vendedores</SelectItem>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={String(v.id)}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {customers.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            {isVendor
              ? 'Aún no tienes clientes asignados. Contacta al administrador.'
              : 'No hay clientes con vendedor asignado. Asigna uno desde el admin.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Cliente</TableHead>
                  <TableHead>RIF</TableHead>
                  <TableHead className="text-right">Deuda (USD)</TableHead>
                  <TableHead className="text-right">Comisión</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-semibold">{c.name}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">{c.taxId}</TableCell>
                    <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400">
                      {formatUSD(Number(c.currentDebtUSD) || 0)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {Number(c.commissionPct) || 0}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Facturas y comisiones */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">
              Facturas {isVendor ? 'de mi cartera' : 'con vendedor'}
            </h2>
          </div>
          <span className="text-xs text-muted-foreground">{filteredRows.length} factura(s)</span>
        </div>

        {filteredRows.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            No hay facturas con vendedor asociado todavía.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Factura</TableHead>
                  <TableHead>Cliente</TableHead>
                  {!isVendor && <TableHead>Vendedor</TableHead>}
                  <TableHead className="text-right">Total (USD)</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-right">Comisión</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((r) => (
                  <TableRow key={r.invoiceId}>
                    <TableCell className="font-mono font-bold">{r.invoiceNumber}</TableCell>
                    <TableCell>{r.customerName}</TableCell>
                    {!isVendor && <TableCell className="text-muted-foreground">{r.vendorName}</TableCell>}
                    <TableCell className="text-right font-mono">
                      {formatUSD(r.totalUSD)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={r.status === 'paid' ? 'emerald' : 'amber'} size="sm" dot={r.status === 'paid'}>
                        {r.status === 'paid' ? 'Pagada' : 'Pendiente'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {formatUSD(r.commissionUSD)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
