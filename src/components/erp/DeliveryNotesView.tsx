'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Truck,
  Ban,
  Printer,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatUSD, formatVES } from './KpiCard';
import { Badge } from './Badge';
import { voidDeliveryNoteAction } from '@/actions/erpActions';
import { ShareDocButtons } from './ShareDocButtons';
import type { DeliveryNote } from '@/payload-types';

interface DeliveryNotesViewProps {
  tenantId: number;
  tenantSlug: string;
  notes: DeliveryNote[];
}

const STATUS_BADGE: Record<string, { variant: 'slate' | 'amber' | 'emerald' | 'rose'; label: string }> = {
  issued: { variant: 'emerald', label: 'Emitida' },
  voided: { variant: 'rose', label: 'Anulada' },
};

export function DeliveryNotesView({ tenantId, tenantSlug, notes }: DeliveryNotesViewProps) {
  const [busyNoteId, setBusyNoteId] = useState<number | undefined>(undefined);

  const issued = notes.filter((n) => n.status === 'issued');
  const issuedValue = issued.reduce((acc, n) => acc + (Number(n.totalUSD) || 0), 0);

  const handleVoid = async (noteId: number) => {
    setBusyNoteId(noteId);
    const res = await voidDeliveryNoteAction({ tenantId, tenantSlug, deliveryNoteId: noteId });
    setBusyNoteId(undefined);
    if (res.success) {
      toast.success('Remisión anulada.');
    } else {
      toast.error(res.error || 'No se pudo anular la remisión.');
    }
  };

  const orderRef = (n: DeliveryNote) => {
    const order = typeof n.order === 'object' && n.order !== null ? n.order : null;
    if (!order) return { label: '—', href: null };
    return {
      label: (order as { orderNumber: string }).orderNumber,
      href: `/${tenantSlug}/erp/orders/${(order as { id: number }).id}`,
    };
  };

  const customerName = (n: DeliveryNote) =>
    typeof n.customer === 'object' && n.customer !== null
      ? (n.customer as { name: string }).name
      : 'Cliente';

  const customerEmail = (n: DeliveryNote) =>
    typeof n.customer === 'object' && n.customer !== null
      ? ((n.customer as { email?: string | null }).email ?? '')
      : '';

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
            <span className="text-xs font-semibold text-indigo-400">Remisiones</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Remisiones / Notas de Entrega</h1>
          <p className="text-xs text-slate-400 mt-1">
            Documento logístico de despacho emitido desde pedidos confirmados. Sin efecto en inventario: el stock se descarga al facturar.
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Remisiones Emitidas</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-emerald-400">{issued.length}</span>
            <span className="text-xs text-slate-400">activas</span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Valor Despachado (USD)</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-white">{formatUSD(issuedValue)}</span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Anuladas</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-rose-400">
              {notes.filter((n) => n.status === 'voided').length}
            </span>
            <span className="text-xs text-slate-400">histórico</span>
          </div>
        </div>
      </div>

      {/* Listado */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden backdrop-blur">
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-white">Remisiones del Inquilino</h2>
          </div>
          <span className="text-xs text-slate-400">{notes.length} registro(s)</span>
        </div>

        {notes.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-10">
            No hay remisiones registradas. Emítalas desde un pedido confirmado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                  <th className="p-3">Nro.</th>
                  <th className="p-3">Pedido</th>
                  <th className="p-3">Cliente</th>
                  <th className="p-3 text-right">Valor (USD)</th>
                  <th className="p-3 text-right">Valor (VES)</th>
                  <th className="p-3 text-center">Estado</th>
                  <th className="p-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {notes.map((n) => {
                  const badge = STATUS_BADGE[n.status] || STATUS_BADGE.issued;
                  const order = orderRef(n);
                  return (
                    <tr key={n.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3 font-mono font-bold text-white">
                        <Link
                          href={`/${tenantSlug}/erp/delivery-notes/${n.id}`}
                          className="hover:text-indigo-300 underline decoration-slate-700 underline-offset-2"
                        >
                          {n.noteNumber}
                        </Link>
                      </td>
                      <td className="p-3 text-slate-200">
                        {order.href ? (
                          <Link href={order.href} className="text-indigo-400 hover:text-indigo-300 font-mono">
                            {order.label}
                          </Link>
                        ) : (
                          order.label
                        )}
                      </td>
                      <td className="p-3 text-slate-200">{customerName(n)}</td>
                      <td className="p-3 text-right font-mono font-bold text-white">
                        {formatUSD(Number(n.totalUSD) || 0)}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-300">
                        {formatVES(Number(n.totalVES) || 0)}
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant={badge.variant} size="sm">
                          {badge.label}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <ShareDocButtons
                            collection="delivery-notes"
                            tenantId={tenantId}
                            documentId={n.id}
                            docLabel={n.noteNumber || `REM-${n.id}`}
                            defaultEmail={customerEmail(n)}
                          />
                          <Link
                            href={`/${tenantSlug}/erp/delivery-notes/${n.id}`}
                            className="inline-flex items-center gap-1 text-slate-400 hover:text-white text-[11px] font-semibold px-2 py-1"
                          >
                            <Printer className="h-3 w-3" />
                            <span>Imprimir</span>
                          </Link>
                          {n.status === 'issued' && (
                            <button
                              onClick={() => handleVoid(n.id)}
                              disabled={busyNoteId === n.id}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-rose-600/10 text-rose-300 border border-rose-500/30 hover:bg-rose-600 hover:text-white font-semibold disabled:opacity-40"
                            >
                              <Ban className="h-3 w-3" />
                              <span>Anular</span>
                            </button>
                          )}
                        </div>
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
