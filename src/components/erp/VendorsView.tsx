'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Users, Receipt, Trophy, FileSpreadsheet } from 'lucide-react';
import { formatUSD } from './format';
import { Badge } from './Badge';
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/${tenantSlug}/erp`}
              className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" />
              Dashboard
            </Link>
            <span className="text-slate-600">/</span>
            <span className="text-xs font-semibold text-indigo-400">
              {isVendor ? 'Mi Cartera & Comisiones' : 'Vendedores & Comisiones'}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {isVendor ? 'Mi Canal de Ventas' : 'Vendedores & Comisiones'}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Comisiones derivadas de facturas: {formatUSD(earnedUSD)} ganadas (pagadas) ·{' '}
            {formatUSD(pendingUSD)} pendientes (emitidas).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
            <span>Exportar Comisiones</span>
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Comisiones Ganadas</p>
          <div className="mt-1 flex items-baseline gap-2">
            <Trophy className="h-4 w-4 text-emerald-400" />
            <span className="text-xl font-bold text-emerald-400">{formatUSD(earnedUSD)}</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">facturas pagadas</p>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Comisiones Pendientes</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-amber-400">{formatUSD(pendingUSD)}</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">facturas emitidas / parciales</p>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Cartera Asignada</p>
          <div className="mt-1 flex items-baseline gap-2">
            <Users className="h-4 w-4 text-indigo-400" />
            <span className="text-xl font-bold text-white">{customers.length}</span>
            <span className="text-xs text-slate-400">cliente(s)</span>
          </div>
        </div>
      </div>

      {/* Cartera de clientes */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden backdrop-blur">
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Cartera de Clientes</h2>
          {!isVendor && vendors.length > 0 && (
            <select
              value={vendorFilter}
              onChange={(e) =>
                setVendorFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
              }
              className="rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-1 text-xs text-white"
            >
              <option value="all">Todos los vendedores</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {customers.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-8">
            {isVendor
              ? 'Aún no tienes clientes asignados. Contacta al administrador.'
              : 'No hay clientes con vendedor asignado. Asigna uno desde el admin.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                  <th className="p-3">Cliente</th>
                  <th className="p-3">RIF</th>
                  <th className="p-3 text-right">Deuda (USD)</th>
                  <th className="p-3 text-right">Comisión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {customers.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-800/30">
                      <td className="p-3 font-semibold text-white">{c.name}</td>
                      <td className="p-3 font-mono text-slate-400">{c.taxId}</td>
                      <td className="p-3 text-right font-mono text-amber-400">
                        {formatUSD(Number(c.currentDebtUSD) || 0)}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-300">
                        {Number(c.commissionPct) || 0}%
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Facturas y comisiones */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden backdrop-blur">
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-white">
              Facturas {isVendor ? 'de mi cartera' : 'con vendedor'}
            </h2>
          </div>
          <span className="text-xs text-slate-400">{filteredRows.length} factura(s)</span>
        </div>

        {filteredRows.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-8">
            No hay facturas con vendedor asociado todavía.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                  <th className="p-3">Factura</th>
                  <th className="p-3">Cliente</th>
                  {!isVendor && <th className="p-3">Vendedor</th>}
                  <th className="p-3 text-right">Total (USD)</th>
                  <th className="p-3 text-center">Estado</th>
                  <th className="p-3 text-right">Comisión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredRows.map((r) => (
                  <tr key={r.invoiceId} className="hover:bg-slate-800/30">
                    <td className="p-3 font-mono font-bold text-white">{r.invoiceNumber}</td>
                    <td className="p-3 text-slate-200">{r.customerName}</td>
                    {!isVendor && <td className="p-3 text-slate-300">{r.vendorName}</td>}
                    <td className="p-3 text-right font-mono text-slate-200">
                      {formatUSD(r.totalUSD)}
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant={r.status === 'paid' ? 'emerald' : 'amber'} size="sm">
                        {r.status === 'paid' ? 'Pagada' : 'Pendiente'}
                      </Badge>
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-400">
                      {formatUSD(r.commissionUSD)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
