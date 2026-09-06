import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  MessageCircle,
  Printer,
  Receipt,
  Wallet,
} from 'lucide-react';
import {
  getTenantBySlug,
  getCustomerDetail,
} from '@/utilities/erpData';
import { resolveEffectiveRate } from '@/utilities/exchangeRate';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { formatUSD, formatVES } from '@/components/erp/KpiCard';
import { Badge } from '@/components/erp/Badge';
import type { Invoice, CustomerPayment } from '@/payload-types';

interface PageProps {
  params: Promise<{ tenant: string; id: string }>;
}

export default async function CustomerDetailPage({ params }: PageProps) {
  const { tenant: tenantSlug, id } = await params;
  const customerId = Number(id);
  if (!Number.isFinite(customerId)) {
    notFound();
  }

  let tenant: Awaited<ReturnType<typeof getTenantBySlug>> = null;
  let detail: Awaited<ReturnType<typeof getCustomerDetail>> | null = null;
  let effectiveRate = 1;

  try {
    tenant = await getTenantBySlug(tenantSlug);
    if (tenant) {
      const [fetchedDetail, rateData] = await Promise.all([
        getCustomerDetail(tenant.id, customerId),
        resolveEffectiveRate(
          tenant.currencyConfig
            ? {
                manualExchangeRate: tenant.currencyConfig.manualExchangeRate ?? undefined,
                autoSyncRate: tenant.currencyConfig.autoSyncRate ?? undefined,
              }
            : undefined,
        ),
      ]);
      detail = fetchedDetail;
      effectiveRate = rateData.rate;
    }
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    if (error instanceof Error && error.message.includes('no encontrado')) {
      notFound();
    }
    throw error;
  }

  if (!tenant || !detail) {
    notFound();
  }

  const { customer, invoices, payments } = detail;
  const debtUSD = Number(customer.currentDebtUSD) || 0;
  const overdueUSD = Number(customer.overdueDebtUSD) || 0;
  const waPhone = (customer.phone || '').replace(/[^0-9]/g, '');

  return (
    <div className="space-y-6">
      {/* Header (fuera de impresión) */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/${tenantSlug}/erp/customers`}
              className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" />
              Clientes & Cartera
            </Link>
            <span className="text-slate-600">/</span>
            <span className="text-xs font-semibold text-indigo-400">{customer.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {customer.whatsappDebtUrl && debtUSD > 0 && (
            <a
              href={customer.whatsappDebtUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="no-print inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-600/10 text-xs font-semibold text-emerald-300 hover:bg-emerald-600 hover:text-white transition-colors"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              <span>Cobranza WhatsApp</span>
            </a>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="no-print inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Imprimir Estado de Cuenta</span>
          </button>
        </div>
      </div>

      {/* Estado de cuenta imprimible */}
      <div className="print-area space-y-6">
        {/* Ficha del cliente */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-white">{customer.name}</h1>
              <p className="text-xs font-mono text-slate-400">{customer.taxId}</p>
              <p className="text-xs text-slate-400">
                {customer.phone} {customer.email ? `· ${customer.email}` : ''}
              </p>
              {customer.address && <p className="text-xs text-slate-500">{customer.address}</p>}
            </div>
            <div className="text-right space-y-1">
              <div className="text-xs uppercase font-semibold text-slate-400">Deuda Total</div>
              <div className="text-2xl font-bold font-mono text-amber-400">
                {formatUSD(debtUSD)}
              </div>
              <div className="text-xs font-mono text-slate-400">
                ≈ {formatVES(debtUSD * effectiveRate)}
              </div>
              {overdueUSD > 0 && (
                <div className="text-xs font-semibold text-rose-400">
                  Vencida: {formatUSD(overdueUSD)}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border-t border-slate-800/80 pt-3">
            <div>
              <span className="text-slate-500 block">Crédito</span>
              <span className="text-slate-200 font-semibold">
                {customer.creditAllowed ? 'Habilitado' : 'Sin crédito'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Límite</span>
              <span className="text-slate-200 font-semibold font-mono">
                {formatUSD(Number(customer.creditLimitUSD) || 0)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Días de gracia</span>
              <span className="text-slate-200 font-semibold font-mono">
                {Number(customer.creditDays) || 0} días
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Tier de precio</span>
              <span className="text-slate-200 font-semibold capitalize">
                {customer.priceTier || 'retail'}
              </span>
            </div>
          </div>
        </div>

        {/* Facturas */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden">
          <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-white">Facturas</h2>
            </div>
            <span className="text-xs text-slate-400">{invoices.length} registro(s)</span>
          </div>
          {invoices.length === 0 ? (
            <p className="text-xs text-slate-500 p-4">Sin facturas registradas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                    <th className="p-3">Factura</th>
                    <th className="p-3">Emisión</th>
                    <th className="p-3 text-right">Total USD</th>
                    <th className="p-3 text-right">Saldo USD</th>
                    <th className="p-3 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {invoices.map((inv: Invoice) => (
                    <tr key={inv.id} className="hover:bg-slate-800/30">
                      <td className="p-3">
                        <Link
                          href={`/${tenantSlug}/erp/invoices/${inv.id}`}
                          className="font-mono font-bold text-indigo-400 hover:text-indigo-300"
                        >
                          {inv.invoiceNumber}
                        </Link>
                      </td>
                      <td className="p-3 text-slate-300">
                        {new Date(inv.issueDate).toLocaleDateString('es-VE')}
                      </td>
                      <td className="p-3 text-right font-mono text-white">
                        {formatUSD(Number(inv.totalUSD) || 0)}
                      </td>
                      <td className="p-3 text-right font-mono text-amber-400">
                        {formatUSD(Number(inv.balanceUSD) || 0)}
                      </td>
                      <td className="p-3 text-center">
                        <Badge
                          variant={
                            inv.status === 'paid'
                              ? 'emerald'
                              : inv.status === 'partially_paid'
                                ? 'amber'
                                : inv.status === 'voided'
                                  ? 'rose'
                                  : 'indigo'
                          }
                          size="sm"
                        >
                          {inv.status === 'paid'
                            ? 'Pagada'
                            : inv.status === 'partially_paid'
                              ? 'Parcial'
                              : inv.status === 'voided'
                                ? 'Anulada'
                                : 'Emitida'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagos */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden">
          <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-white">Pagos Recibidos</h2>
            </div>
            <span className="text-xs text-slate-400">{payments.length} pago(s)</span>
          </div>
          {payments.length === 0 ? (
            <p className="text-xs text-slate-500 p-4">Sin pagos registrados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                    <th className="p-3">Recibo</th>
                    <th className="p-3">Fecha</th>
                    <th className="p-3 text-right">Monto USD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {payments.map((p: CustomerPayment) => (
                    <tr key={p.id}>
                      <td className="p-3 font-mono font-bold text-white">{p.paymentNumber}</td>
                      <td className="p-3 text-slate-300">
                        {new Date(p.paymentDate).toLocaleDateString('es-VE')}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-400">
                        {formatUSD(Number(p.totalUSD) || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
