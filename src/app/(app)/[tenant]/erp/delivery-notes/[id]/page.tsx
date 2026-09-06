import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Truck } from 'lucide-react';
import { getTenantBySlug, getDeliveryNoteDetail } from '@/utilities/erpData';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { PrintButton } from '@/components/erp/PrintButton';
import { Badge } from '@/components/erp/Badge';
import { formatUSD, formatVES } from '@/components/erp/KpiCard';

interface PageProps {
  params: Promise<{ tenant: string; id: string }>;
}

export default async function DeliveryNoteDetailPage({ params }: PageProps) {
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

  let note;
  try {
    note = await getDeliveryNoteDetail(tenant.id, Number(id));
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  if (!note) {
    notFound();
  }

  const badge = note.status === 'voided'
    ? { variant: 'rose' as const, label: 'Anulada' }
    : { variant: 'emerald' as const, label: 'Emitida' };
  const order =
    typeof note.order === 'object' && note.order !== null ? note.order : null;
  const customer =
    typeof note.customer === 'object' && note.customer !== null ? note.customer : null;

  return (
    <div className="space-y-6">
      {/* Header (no imprime) */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/${tenantSlug}/erp/delivery-notes`}
              className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" />
              Remisiones
            </Link>
            <span className="text-slate-600">/</span>
            <span className="text-xs font-mono font-semibold text-indigo-400">{note.noteNumber}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {order && (
            <Link
              href={`/${tenantSlug}/erp/orders/${(order as { id: number }).id}`}
              className="no-print inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-500/30 bg-indigo-600/10 text-xs font-semibold text-indigo-300 hover:bg-indigo-600 hover:text-white transition-colors"
            >
              Ver Pedido
            </Link>
          )}
          <PrintButton label="Imprimir Remisión" />
        </div>
      </div>

      {/* Contenido imprimible */}
      <div className="print-area space-y-6">
        {/* Ficha */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                <Truck className="h-6 w-6 text-indigo-400" />
                Remisión {note.noteNumber}
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
                {note.issueDate ? new Date(note.issueDate).toLocaleDateString('es-VE') : '—'}
              </p>
              {order && (
                <p className="text-[11px] font-mono text-slate-400">
                  Pedido: {(order as { orderNumber: string }).orderNumber}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Líneas despachadas */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                <th className="p-3">Descripción</th>
                <th className="p-3">SKU</th>
                <th className="p-3 text-right">Cantidad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {(Array.isArray(note.items) ? note.items : []).map((it, idx) => (
                <tr key={idx}>
                  <td className="p-3 text-white">{it.description}</td>
                  <td className="p-3 font-mono text-slate-400">{it.sku || '—'}</td>
                  <td className="p-3 text-right font-mono font-bold text-white">{it.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Notas */}
        {note.notes && (
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-5">
            <p className="text-[10px] uppercase font-semibold text-slate-400 mb-1">Notas de Entrega</p>
            <p className="text-xs text-slate-300 whitespace-pre-wrap">{note.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
