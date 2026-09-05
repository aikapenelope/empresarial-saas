import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { MessageCircle, ArrowLeft } from 'lucide-react';
import { getTenantBySlug, getCustomersWithDebt } from '@/utilities/erpData';
import { resolveEffectiveRate } from '@/utilities/exchangeRate';
import { formatUSD, formatVES } from '@/components/erp/KpiCard';
import { Badge } from '@/components/erp/Badge';

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function CustomersPage({ params }: PageProps) {
  const { tenant: tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);

  if (!tenant) {
    notFound();
  }

  const [customers, rateData] = await Promise.all([
    getCustomersWithDebt(tenant.id),
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

  let totalDebtUSD = 0;
  let overdueDebtUSD = 0;
  let debtorsCount = 0;

  for (const c of customers) {
    const debt = Number(c.currentDebtUSD) || 0;
    const overdue = Number(c.overdueDebtUSD) || 0;
    totalDebtUSD += debt;
    overdueDebtUSD += overdue;
    if (debt > 0) debtorsCount++;
  }

  const totalDebtVES = totalDebtUSD * effectiveRate;

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
            <span className="text-xs font-semibold text-indigo-400">Clientes & Cartera CxC</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Gestión de Clientes & Cobranzas
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Monitoreo bimonetario de saldos deudores, días de crédito y gestión de cobranza directa por WhatsApp.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/admin/collections/customers/create"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors shadow-sm"
          >
            + Nuevo Cliente
          </Link>
        </div>
      </div>

      {/* KPIs de Cartera */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Cartera Deudora Total</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-white">{formatUSD(totalDebtUSD)}</span>
            <span className="text-xs font-medium text-emerald-400">≈ {formatVES(totalDebtVES)}</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Cartera Vencida</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-rose-400">{formatUSD(overdueDebtUSD)}</span>
            <span className="text-xs text-slate-400">({debtorsCount} deudores)</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Padrón de Clientes</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-white">{customers.length}</span>
            <span className="text-xs text-slate-400">registrados en el inquilino</span>
          </div>
        </div>
      </div>

      {/* Tabla de Clientes */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden backdrop-blur">
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Listado de Clientes & Balances</h2>
          <span className="text-xs text-slate-400">Ordenado por mayor saldo deudor</span>
        </div>

        {customers.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            No hay clientes registrados en este inquilino.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                  <th className="p-3">Razón Social / Contacto</th>
                  <th className="p-3">RIF / Cédula</th>
                  <th className="p-3">Segmento</th>
                  <th className="p-3 text-right">Límite Crédito</th>
                  <th className="p-3 text-right">Deuda Actual USD</th>
                  <th className="p-3 text-right">Deuda Actual VES</th>
                  <th className="p-3 text-center">Cobranza WhatsApp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {customers.map((c) => {
                  const debt = Number(c.currentDebtUSD) || 0;
                  const debtVES = Number(c.currentDebtVES) || debt * effectiveRate;
                  const overdue = Number(c.overdueDebtUSD) || 0;

                  return (
                    <tr key={c.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3">
                        <div className="font-semibold text-white">{c.name}</div>
                        <div className="text-[11px] text-slate-400">{c.phone || c.email || 'Sin contacto'}</div>
                      </td>
                      <td className="p-3 font-mono text-slate-300">{c.taxId}</td>
                      <td className="p-3">
                        <Badge
                          variant={
                            c.status === 'vip'
                              ? 'emerald'
                              : c.status === 'recurring'
                                ? 'indigo'
                                : 'slate'
                          }
                          size="sm"
                        >
                          {c.status || 'general'}
                        </Badge>
                      </td>
                      <td className="p-3 text-right font-mono text-slate-400">
                        {c.creditAllowed ? formatUSD(Number(c.creditLimitUSD) || 0) : 'Contado'}
                      </td>
                      <td className="p-3 text-right font-mono font-bold">
                        <span className={debt > 0 ? (overdue > 0 ? 'text-rose-400' : 'text-amber-400') : 'text-slate-400'}>
                          {formatUSD(debt)}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono text-slate-300">
                        {debt > 0 ? formatVES(debtVES) : 'Bs. 0,00'}
                      </td>
                      <td className="p-3 text-center">
                        {c.whatsappDebtUrl && debt > 0 ? (
                          <a
                            href={c.whatsappDebtUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors shadow-sm"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            <span>Cobrar WhatsApp</span>
                          </a>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-medium">Al día</span>
                        )}
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
