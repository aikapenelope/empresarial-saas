import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { getTenantBySlug, getOrderDetail } from '@/utilities/erpData';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { PrintButton } from '@/components/erp/PrintButton';
import { Badge } from '@/components/erp/Badge';
import { formatUSD, formatVES } from '@/components/erp/KpiCard';

interface PageProps {
  params: Promise<{ tenant: string; id: string }>;
}

const STATUS_BADGE: Record<string, { variant: 'slate' | 'amber' | 'emerald' | 'rose' | 'indigo'; label: string }> = {
  draft: { variant: 'slate', label: 'Borrador' },
  confirmed: { variant: 'amber', label: 'Confirmado' },
  invoiced: { variant: 'indigo', label: 'Facturado' },
  canceled: { variant: 'rose', label: 'Cancelado' },
};

export default async function OrderDetailPage({ params }: PageProps) {
  const { tenant: tenantSlug, id } = await params;
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

  let data: Awaited<ReturnType<typeof getOrderDetail>>;
  try {
    data = await getOrderDetail(tenant.id, Number(id));
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  const { order, invoice } = data;
  const badge = STATUS_BADGE[order.status] || STATUS_BADGE.draft;
  const customer =
    typeof order.customer === 'object' && order.customer !== null ? order.customer : null;
  const invoiceId =
    typeof order.issuedInvoice === 'object' && order.issuedInvoice !== null
      ? order.issuedInvoice.id
      : order.issuedInvoice;
  const rate = Number(order.exchangeRateSnapshot) || 1;

  return (
    <div className="space-y-6">
      {/* Header (no imprime) */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/${tenantSlug}/erp/orders`}
              className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" />
              Pedidos
            </Link>
            <span className="text-slate-600">/</span>
            <span className="text-xs font-mono font-semibold text-indigo-400">{order.orderNumber}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {invoiceId && (
            <Link
              href={`/${tenantSlug}/erp/invoices/${invoiceId}`}
              className="no-print inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-500/30 bg-indigo-600/10 text-xs font-semibold text-indigo-300 hover:bg-indigo-600 hover:text-white transition-colors"
            >
              Ver Factura Emitida
            </Link>
          )}
          <PrintButton label="Imprimir Pedido" />
        </div>
      </div>

      {/* Contenido imprimible */}
      <div className="print-area space-y-6">
        {/* Ficha del pedido */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                <ClipboardList className="h-6 w-6 text-indigo-400" />
                {order.orderNumber}
              </h1>
              <p className="text-xs text-slate-400">
                {customer ? `${customer.name} · ${customer.taxId}` : 'Cliente'}
              </p>
            </div>
            <div className="text-right space-y-1">
              <Badge variant={badge.variant} size="sm">
                {badge.label}
              </Badge>
              <p className="text-[11px] text-slate-400">
                {order.issueDate ? new Date(order.issueDate).toLocaleDateString('es-VE') : '—'}
                {order.confirmedAt
                  ? ` · Confirmado ${new Date(order.confirmedAt).toLocaleDateString('es-VE')}`
                  : ''}
              </p>
              <p className="text-[11px] text-slate-400">
                Tier: <span className="uppercase">{order.priceTierSnapshot || 'retail'}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Líneas */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                <th className="p-3">Descripción</th>
                <th className="p-3">SKU</th>
                <th className="p-3 text-right">Cant.</th>
                <th className="p-3 text-right">Precio (USD)</th>
                <th className="p-3 text-right">Desc. %</th>
                <th className="p-3 text-right">Total (USD)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {(Array.isArray(order.items) ? order.items : []).map((it, idx) => (
                <tr key={idx}>
                  <td className="p-3 text-white">{it.description}</td>
                  <td className="p-3 font-mono text-slate-400">{it.sku || '—'}</td>
                  <td className="p-3 text-right font-mono text-slate-200">{it.quantity}</td>
                  <td className="p-3 text-right font-mono text-slate-200">{formatUSD(Number(it.unitPriceUSD) || 0)}</td>
                  <td className="p-3 text-right font-mono text-slate-400">
                    {Number(it.discountPct) > 0 ? `${it.discountPct}%` : '—'}
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-white">
                    {formatUSD(Number(it.totalUSD) || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totales */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-5 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Tasa aplicada:</span>
            <span className="font-mono text-slate-200">{formatUSD(rate)} / USD</span>
          </div>
          <div className="flex items-center justify-between text-base font-bold text-white border-t border-slate-800/80 pt-2">
            <span>Total Pedido (USD):</span>
            <span className="font-mono text-amber-400">{formatUSD(Number(order.totalUSD) || 0)}</span>
          </div>
          <div className="flex items-center justify-between text-sm text-slate-300">
            <span>Total Pedido (VES):</span>
            <span className="font-mono">{formatVES(Number(order.totalVES) || 0)}</span>
          </div>
        </div>

        {/* Notas */}
        {order.notes && (
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-5">
            <p className="text-[10px] uppercase font-semibold text-slate-400 mb-1">Notas / Instrucciones</p>
            <p className="text-xs text-slate-300 whitespace-pre-wrap">{order.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
