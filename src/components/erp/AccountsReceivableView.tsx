'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Wallet, TriangleAlert, Users, FileText } from 'lucide-react';
import { formatUSD } from './KpiCard';
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

/**
 * Cartera con antigüedad (Sprint 21): saldos abiertos por cliente en buckets
 * 0-30/31-60/61-90/90+ días de vencido. Filtro por vendedor para el canal;
 * drilldown al detalle del cliente.
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
            <span className="text-xs font-semibold text-indigo-400">Cartera CxC</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Cuentas por Cobrar — Antigüedad</h1>
          <p className="text-xs text-slate-400 mt-1">
            Saldos abiertos por cliente con días de vencido (corte {new Date(asOf).toLocaleDateString('es-VE')}).
          </p>
        </div>

        {!isVendor && vendors.length > 0 && (
          <select
            value={String(vendorFilter)}
            onChange={(e) =>
              setVendorFilter(e.target.value === 'all' ? 'all' : e.target.value === 'none' ? 'none' : Number(e.target.value))
            }
            className="rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
          >
            <option value="all">Todo el canal</option>
            <option value="none">Sin vendedor asignado</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Total CxC</p>
          <div className="mt-1 flex items-center gap-2">
            <Wallet className="h-4 w-4 text-indigo-400" />
            <span className="text-xl font-bold text-white">{formatUSD(filteredSummary.totalUSD)}</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">{filteredSummary.openInvoiceCount} factura(s) abierta(s)</p>
        </div>
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Vencido +90 días</p>
          <div className="mt-1 flex items-center gap-2">
            <TriangleAlert className="h-4 w-4 text-rose-400" />
            <span className="text-xl font-bold text-rose-400">{formatUSD(filteredSummary.bucket90Plus)}</span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Vencido total</p>
          <div className="mt-1 flex items-center gap-2">
            <TriangleAlert className="h-4 w-4 text-amber-400" />
            <span className="text-xl font-bold text-amber-400">{formatUSD(filteredSummary.overdueUSD)}</span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Clientes con Vencido</p>
          <div className="mt-1 flex items-center gap-2">
            <Users className="h-4 w-4 text-indigo-400" />
            <span className="text-xl font-bold text-white">{filteredSummary.customersWithOverdue}</span>
          </div>
        </div>
      </div>

      {/* Tabla por cliente */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden backdrop-blur">
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-white">Cartera por Cliente</h2>
          </div>
          <span className="text-xs text-slate-400">{filteredRows.length} cliente(s) con saldo</span>
        </div>

        {filteredRows.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-10">
            No hay saldos abiertos con estos filtros.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Vendedor</th>
                  <th className="p-3 text-right">Corriente</th>
                  <th className="p-3 text-right">1–30</th>
                  <th className="p-3 text-right">31–60</th>
                  <th className="p-3 text-right">61–90</th>
                  <th className="p-3 text-right">+90</th>
                  <th className="p-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredRows.map((r) => (
                  <tr key={r.customerId} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-3">
                      <Link
                        href={`/${tenantSlug}/erp/customers/${r.customerId}`}
                        className="text-slate-200 font-semibold hover:text-indigo-300 underline decoration-slate-700 underline-offset-2"
                      >
                        {r.customerName}
                      </Link>
                      <span className="ml-2 text-[10px] text-slate-500">{r.invoiceCount} fact.</span>
                    </td>
                    <td className="p-3 text-slate-400">{r.vendorName}</td>
                    <td className="p-3 text-right font-mono text-slate-300">{formatUSD(r.currentUSD)}</td>
                    <td className="p-3 text-right font-mono text-slate-300">{formatUSD(r.bucket1_30)}</td>
                    <td className="p-3 text-right font-mono text-amber-300">{formatUSD(r.bucket31_60)}</td>
                    <td className="p-3 text-right font-mono text-orange-300">{formatUSD(r.bucket61_90)}</td>
                    <td className="p-3 text-right font-mono font-bold text-rose-400">{formatUSD(r.bucket90Plus)}</td>
                    <td className="p-3 text-right font-mono font-bold text-white">{formatUSD(r.totalUSD)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-800 bg-slate-950/60 font-semibold">
                  <td className="p-3 text-slate-300" colSpan={2}>
                    Total
                  </td>
                  <td className="p-3 text-right font-mono text-slate-200">{formatUSD(filteredSummary.currentUSD)}</td>
                  <td className="p-3 text-right font-mono text-slate-200">{formatUSD(filteredSummary.bucket1_30)}</td>
                  <td className="p-3 text-right font-mono text-amber-300">{formatUSD(filteredSummary.bucket31_60)}</td>
                  <td className="p-3 text-right font-mono text-orange-300">{formatUSD(filteredSummary.bucket61_90)}</td>
                  <td className="p-3 text-right font-mono text-rose-400">{formatUSD(filteredSummary.bucket90Plus)}</td>
                  <td className="p-3 text-right font-mono text-white">{formatUSD(filteredSummary.totalUSD)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Resumen por vendedor */}
      {!isVendor && vendorRows.length > 1 && (
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden backdrop-blur">
          <div className="p-4 border-b border-slate-800/80 flex items-center gap-2">
            <Users className="h-4 w-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-white">Cartera por Vendedor</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                  <th className="p-3">Vendedor</th>
                  <th className="p-3 text-right">Corriente</th>
                  <th className="p-3 text-right">Vencido</th>
                  <th className="p-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {vendorRows.map((v) => (
                  <tr key={`${v.vendorId ?? 'none'}`} className="hover:bg-slate-800/30">
                    <td className="p-3 text-slate-200 font-semibold">{v.vendorName}</td>
                    <td className="p-3 text-right font-mono text-slate-300">{formatUSD(v.currentUSD)}</td>
                    <td className="p-3 text-right font-mono text-amber-300">{formatUSD(v.overdueUSD)}</td>
                    <td className="p-3 text-right font-mono font-bold text-white">{formatUSD(v.totalUSD)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
