import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getPayload } from 'payload';
import config from '@payload-config';
import { getTenantBySlug } from '@/utilities/erpData';
import { resolveEffectiveRate } from '@/utilities/exchangeRate';
import { formatUSD, formatVES } from '@/components/erp/KpiCard';
import type { Supplier, PurchaseInvoice } from '@/payload-types';

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function SuppliersPage({ params }: PageProps) {
  const { tenant: tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);

  if (!tenant) {
    notFound();
  }

  const payload = await getPayload({ config });

  const [suppliersRes, purchaseInvoicesRes, rateData] = await Promise.all([
    payload.find({
      collection: 'suppliers',
      where: { tenant: { equals: tenant.id } },
      limit: 100,
      depth: 0,
      sort: '-currentDebtUSD',
    }),
    payload.find({
      collection: 'purchase-invoices',
      where: {
        and: [
          { tenant: { equals: tenant.id } },
          { status: { not_equals: 'paid' } },
        ],
      },
      limit: 50,
      depth: 1,
      sort: 'dueDate',
    }),
    resolveEffectiveRate(
      tenant.currencyConfig
        ? {
            manualExchangeRate: tenant.currencyConfig.manualExchangeRate ?? undefined,
            autoSyncRate: tenant.currencyConfig.autoSyncRate ?? undefined,
          }
        : undefined,
    ),
  ]);

  const effectiveRate = rateData.rate;
  const suppliers = suppliersRes.docs as Supplier[];
  const purchaseInvoices = purchaseInvoicesRes.docs as PurchaseInvoice[];

  let totalPayablesUSD = 0;
  for (const inv of purchaseInvoices) {
    totalPayablesUSD += Number(inv.balanceUSD) || 0;
  }
  const totalPayablesVES = totalPayablesUSD * effectiveRate;

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
            <span className="text-xs font-semibold text-indigo-400">Proveedores & CxP</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Gestión de Proveedores & Cuentas por Pagar
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Registro de compras a crédito, facturas por pagar y recepción de mercancía a almacén.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/admin/collections/suppliers/create"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors shadow-sm"
          >
            + Nuevo Proveedor
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Deuda Comercial por Pagar</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-amber-400">{formatUSD(totalPayablesUSD)}</span>
            <span className="text-xs font-medium text-slate-300">≈ {formatVES(totalPayablesVES)}</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Facturas de Compra Pendientes</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-white">{purchaseInvoices.length}</span>
            <span className="text-xs text-slate-400">compromisos activos</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Padrón de Proveedores</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-white">{suppliers.length}</span>
            <span className="text-xs text-slate-400">registrados</span>
          </div>
        </div>
      </div>

      {/* Listado de Proveedores */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden backdrop-blur">
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Proveedores & Saldos Pendientes</h2>
          <span className="text-xs text-slate-400">Ordenado por mayor deuda comercial</span>
        </div>

        {suppliers.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            No hay proveedores registrados en este inquilino.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                  <th className="p-3">Razón Social</th>
                  <th className="p-3">RIF</th>
                  <th className="p-3">Contacto</th>
                  <th className="p-3 text-right">Días Crédito</th>
                  <th className="p-3 text-right">Saldo Deudor USD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {suppliers.map((s) => {
                  const debt = Number(s.currentDebtUSD) || 0;
                  return (
                    <tr key={s.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3 font-semibold text-white">{s.name}</td>
                      <td className="p-3 font-mono text-slate-300">{s.taxId}</td>
                      <td className="p-3 text-slate-400">{s.phone || s.email || '—'}</td>
                      <td className="p-3 text-right font-mono text-slate-300">
                        {s.creditDays ? `${s.creditDays} días` : 'Contado'}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-amber-400">
                        {formatUSD(debt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
