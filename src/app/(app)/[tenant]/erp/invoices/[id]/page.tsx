import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, Clock, Warehouse, User as UserIcon } from 'lucide-react';
import { getTenantBySlug, getInvoiceDetail } from '@/utilities/erpData';
import { ErpAccessError, requireErpTenantAccess } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { PrintButton, VoidInvoiceButton } from '@/components/erp/InvoiceDetailActions';
import { formatUSD, formatVES } from '@/components/erp/KpiCard';
import { Badge } from '@/components/erp/Badge';
import type { User } from '@/payload-types';

interface PageProps {
  params: Promise<{ tenant: string; id: string }>;
}

const STATUS_LABEL: Record<string, { variant: 'slate' | 'amber' | 'emerald' | 'rose' | 'indigo'; label: string }> = {
  draft: { variant: 'slate', label: 'Borrador' },
  issued: { variant: 'indigo', label: 'Emitida' },
  partially_paid: { variant: 'amber', label: 'Pago Parcial' },
  paid: { variant: 'emerald', label: 'Pagada' },
  voided: { variant: 'rose', label: 'Anulada' },
};

export default async function InvoiceDetailPage({ params }: PageProps) {
  const { tenant: tenantSlug, id } = await params;
  const invoiceId = Number(id);
  if (!Number.isFinite(invoiceId)) {
    notFound();
  }

  let tenant: Awaited<ReturnType<typeof getTenantBySlug>> = null;
  let detail: Awaited<ReturnType<typeof getInvoiceDetail>> | null = null;
  let actor: User | null = null;

  try {
    tenant = await getTenantBySlug(tenantSlug);
    if (tenant) {
      actor = await requireErpTenantAccess(tenant.id);
      detail = await getInvoiceDetail(tenant.id, invoiceId);
    }
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  if (!tenant || !detail || !actor) {
    notFound();
  }

  const { invoice, payments, movements, audit } = detail;
  const statusBadge = STATUS_LABEL[invoice.status] || STATUS_LABEL.issued;
  const rate = Number(invoice.exchangeRateSnapshot) || 1;
  const canVoid = actor.role === 'super-admin' || actor.role === 'tenant-admin';

  const customerName =
    typeof invoice.customer === 'object' && invoice.customer !== null
      ? invoice.customer.name
      : 'Cliente';
  const customerTaxId =
    typeof invoice.customer === 'object' && invoice.customer !== null
      ? invoice.customer.taxId
      : '';
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const installments = Array.isArray(invoice.installments) ? invoice.installments : [];
  const emitidaPor =
    typeof invoice.createdBy === 'object' && invoice.createdBy !== null
      ? invoice.createdBy.name
      : null;

  return (
    <div className="space-y-6">
      {/* Header (fuera de impresión) */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/${tenantSlug}/erp/invoices`}
              className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" />
              Facturación & Ventas
            </Link>
            <span className="text-slate-600">/</span>
            <span className="text-xs font-semibold text-indigo-400 font-mono">
              {invoice.invoiceNumber}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canVoid && invoice.status !== 'voided' && (
            <VoidInvoiceButton
              tenantId={tenant.id}
              tenantSlug={tenantSlug}
              invoiceId={invoice.id}
              invoiceNumber={invoice.invoiceNumber}
            />
          )}
          <PrintButton />
        </div>
      </div>

      {/* Documento imprimible */}
      <div className="print-area space-y-6">
        {/* Cabecera del documento */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
                {invoice.invoiceNumber}
                <Badge variant={statusBadge.variant} size="sm">
                  {statusBadge.label}
                </Badge>
              </h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <UserIcon className="h-3.5 w-3.5" />
                  {customerName} ({customerTaxId})
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Emitida: {new Date(invoice.issueDate).toLocaleDateString('es-VE')}
                </span>
                {invoice.dueDate && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    Vence: {new Date(invoice.dueDate).toLocaleDateString('es-VE')}
                  </span>
                )}
                {typeof invoice.warehouse === 'object' && invoice.warehouse !== null && (
                  <span className="flex items-center gap-1">
                    <Warehouse className="h-3.5 w-3.5" />
                    {invoice.warehouse.name}
                  </span>
                )}
                {emitidaPor && <span>Emitida por: {emitidaPor}</span>}
              </div>
            </div>

            <div className="text-right space-y-1">
              <div className="text-2xl font-bold font-mono text-white">
                {formatUSD(Number(invoice.totalUSD) || 0)}
              </div>
              <div className="text-sm font-mono text-emerald-400">
                ≈ {formatVES(Number(invoice.totalVES) || 0)}
              </div>
              <div className="text-xs text-slate-400">
                Tasa snapshot: {formatVES(rate)} / USD
              </div>
              <div className="text-xs font-semibold text-amber-400">
                Saldo: {formatUSD(Number(invoice.balanceUSD) || 0)}
              </div>
            </div>
          </div>
        </div>

        {/* Líneas */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden">
          <h2 className="text-sm font-semibold text-white p-4 border-b border-slate-800/80">
            Líneas de Detalle
          </h2>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                <th className="p-3">SKU</th>
                <th className="p-3">Descripción</th>
                <th className="p-3 text-right">Cant.</th>
                <th className="p-3 text-right">Precio USD</th>
                <th className="p-3 text-right">Total USD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {items.map((it, idx) => (
                <tr key={idx}>
                  <td className="p-3 font-mono text-slate-400">{it.sku || '—'}</td>
                  <td className="p-3 text-white">{it.description}</td>
                  <td className="p-3 text-right font-mono text-slate-300">{it.quantity}</td>
                  <td className="p-3 text-right font-mono text-slate-300">
                    {formatUSD(Number(it.unitPriceUSD) || 0)}
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-white">
                    {formatUSD(Number(it.totalUSD) || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Plan de cuotas */}
        {installments.length > 0 && (
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden">
            <h2 className="text-sm font-semibold text-white p-4 border-b border-slate-800/80">
              Plan de Cuotas
            </h2>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                  <th className="p-3">Cuota</th>
                  <th className="p-3">Vencimiento</th>
                  <th className="p-3 text-right">Monto USD</th>
                  <th className="p-3 text-right">Pagado USD</th>
                  <th className="p-3 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {installments.map((inst, idx) => (
                  <tr key={idx}>
                    <td className="p-3 font-mono text-white">#{inst.number}</td>
                    <td className="p-3 text-slate-300">
                      {inst.dueDate ? new Date(inst.dueDate).toLocaleDateString('es-VE') : '—'}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-300">
                      {formatUSD(Number(inst.amountUSD) || 0)}
                    </td>
                    <td className="p-3 text-right font-mono text-emerald-400">
                      {formatUSD(Number(inst.paidUSD) || 0)}
                    </td>
                    <td className="p-3 text-center">
                      <Badge
                        variant={
                          inst.status === 'paid'
                            ? 'emerald'
                            : inst.status === 'partially_paid'
                              ? 'amber'
                              : 'slate'
                        }
                        size="sm"
                      >
                        {inst.status === 'paid'
                          ? 'Pagada'
                          : inst.status === 'partially_paid'
                            ? 'Parcial'
                            : 'Pendiente'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Cobros aplicados */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden">
          <h2 className="text-sm font-semibold text-white p-4 border-b border-slate-800/80">
            Cobros Aplicados
          </h2>
          {payments.length === 0 ? (
            <p className="text-xs text-slate-500 p-4">Sin cobros registrados.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                  <th className="p-3">Recibo</th>
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Método</th>
                  <th className="p-3 text-right">Monto USD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {payments.map((p) => {
                  const method = (Array.isArray(p.methods) ? p.methods[0] : undefined)?.method || '—';
                  return (
                    <tr key={p.id}>
                      <td className="p-3 font-mono font-bold text-white">{p.paymentNumber}</td>
                      <td className="p-3 text-slate-300">
                        {new Date(p.paymentDate).toLocaleDateString('es-VE')}
                      </td>
                      <td className="p-3 text-slate-300">{method}</td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-400">
                        {formatUSD(Number(p.totalUSD) || 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Kardex */}
        {movements.length > 0 && (
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden">
            <h2 className="text-sm font-semibold text-white p-4 border-b border-slate-800/80">
              Movimientos de Inventario (Kardex)
            </h2>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                  <th className="p-3">Tipo</th>
                  <th className="p-3">Producto</th>
                  <th className="p-3">Almacén</th>
                  <th className="p-3 text-right">Cant.</th>
                  <th className="p-3">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {movements.map((m) => {
                  const productName =
                    typeof m.product === 'object' && m.product !== null ? m.product.name : `#${m.product}`;
                  const wh =
                    m.movementType === 'sale_return'
                      ? typeof m.targetWarehouse === 'object' && m.targetWarehouse !== null
                        ? m.targetWarehouse.name
                        : '—'
                      : typeof m.sourceWarehouse === 'object' && m.sourceWarehouse !== null
                        ? m.sourceWarehouse.name
                        : '—';
                  return (
                    <tr key={m.id}>
                      <td className="p-3">
                        <Badge variant={m.movementType === 'sale_out' ? 'rose' : 'emerald'} size="sm">
                          {m.movementType === 'sale_out' ? 'Salida' : 'Reingreso'}
                        </Badge>
                      </td>
                      <td className="p-3 text-white">{productName}</td>
                      <td className="p-3 text-slate-300">{wh}</td>
                      <td className="p-3 text-right font-mono text-slate-300">{m.quantity}</td>
                      <td className="p-3 text-slate-400 text-[11px]">
                        {new Date(m.createdAt).toLocaleDateString('es-VE')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Auditoría (solo admins ven registros) */}
        {audit.length > 0 && (
          <div className="no-print rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden">
            <h2 className="text-sm font-semibold text-white p-4 border-b border-slate-800/80">
              Auditoría del Documento
            </h2>
            <ul className="divide-y divide-slate-800/60 text-xs">
              {audit.map((entry) => {
                const actorName =
                  entry.actor && typeof entry.actor === 'object'
                    ? ((entry.actor as { name?: string }).name ?? `#${(entry.actor as { id?: number }).id}`)
                    : 'sistema';
                const diffKeys =
                  entry.diff && typeof entry.diff === 'object'
                    ? Object.keys(entry.diff as Record<string, unknown>).join(', ')
                    : '';
                return (
                  <li key={String(entry.id)} className="p-3 flex items-center justify-between gap-3">
                    <span className="text-slate-300">
                      <span className="font-semibold text-white">{String(entry.operation)}</span>
                      {diffKeys && <span className="text-slate-500"> ({diffKeys})</span>}
                      <span className="text-slate-500"> por </span>
                      <span className="text-slate-300">{actorName}</span>
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {new Date(String(entry.createdAt)).toLocaleString('es-VE')}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
