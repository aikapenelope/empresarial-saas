'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  FileText,
  Plus,
  ArrowRightLeft,
  Ban,
  Calendar,
  Zap,
} from 'lucide-react';
import { formatUSD, formatVES } from './KpiCard';
import { Badge } from './Badge';
import { QuoteModal } from './modals/QuoteModal';
import { ConvertQuoteModal } from './modals/ConvertQuoteModal';
import { ShareDocButtons } from './ShareDocButtons';
import { updateQuoteStatusAction } from '@/actions/erpActions';
import type { Quote } from '@/payload-types';

interface QuotesViewProps {
  tenantId: number;
  tenantSlug: string;
  quotes: Quote[];
  customers: Array<{ id: number; name: string; taxId: string }>;
  products: Array<{ id: number; name: string; sku: string; priceUSD: number }>;
  cashRegisters: Array<{ id: number; name: string; code: string; currentStatus: string }>;
  warehouses: Array<{ id: number; name: string; code: string; isDefault?: boolean | null }>;
  effectiveRate: number;
}

const STATUS_BADGE: Record<string, { variant: 'slate' | 'amber' | 'emerald' | 'rose' | 'indigo'; label: string }> = {
  draft: { variant: 'slate', label: 'Borrador' },
  sent: { variant: 'amber', label: 'Enviada' },
  accepted: { variant: 'emerald', label: 'Aceptada' },
  rejected: { variant: 'rose', label: 'Rechazada' },
  expired: { variant: 'slate', label: 'Expirada' },
  converted: { variant: 'indigo', label: 'Convertida' },
};

export function QuotesView({
  tenantId,
  tenantSlug,
  quotes,
  customers,
  products,
  cashRegisters,
  warehouses,
  effectiveRate,
}: QuotesViewProps) {
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quote | undefined>(undefined);
  const [convertQuote, setConvertQuote] = useState<Quote | undefined>(undefined);
  const [busyQuoteId, setBusyQuoteId] = useState<number | undefined>(undefined);

  const convertible = (q: Quote) => ['draft', 'sent', 'accepted'].includes(q.status);
  const statusActions = (q: Quote) => {
    if (q.status === 'draft') return ['sent', 'rejected'];
    if (q.status === 'sent') return ['accepted', 'rejected'];
    if (q.status === 'accepted') return [];
    return [];
  };

  const handleStatus = async (quoteId: number, status: 'sent' | 'accepted' | 'rejected') => {
    setBusyQuoteId(quoteId);
    await updateQuoteStatusAction({ tenantId, tenantSlug, quoteId, status });
    setBusyQuoteId(undefined);
  };

  const customerName = (q: Quote) =>
    typeof q.customer === 'object' && q.customer !== null
      ? (q.customer as { name: string }).name
      : 'Cliente';

  const customerEmail = (q: Quote) =>
    typeof q.customer === 'object' && q.customer !== null
      ? ((q.customer as { email?: string | null }).email ?? '')
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
            <span className="text-xs font-semibold text-indigo-400">Cotizaciones</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Cotizaciones</h1>
          <p className="text-xs text-slate-400 mt-1">
            Vender sin facturar: cotiza, hace seguimiento del estado y convierte a factura en un clic.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/${tenantSlug}/erp/quotes/quick`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/10 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/25 transition-colors"
          >
            <Zap className="h-3.5 w-3.5" />
            <span>Cotización rápida</span>
          </Link>
          <button
            onClick={() => setIsQuoteModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>+ Nueva Cotización</span>
          </button>
        </div>
      </div>

      {/* Listado */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden backdrop-blur">
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-white">Cotizaciones del Inquilino</h2>
          </div>
          <span className="text-xs text-slate-400">{quotes.length} registro(s)</span>
        </div>

        {quotes.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-10">
            No hay cotizaciones registradas todavía.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                  <th className="p-3">Nro.</th>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Válida Hasta</th>
                  <th className="p-3 text-right">Total (USD)</th>
                  <th className="p-3 text-right">Total (VES)</th>
                  <th className="p-3 text-center">Estado</th>
                  <th className="p-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {quotes.map((q) => {
                  const badge = STATUS_BADGE[q.status] || STATUS_BADGE.draft;
                  return (
                    <tr key={q.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3 font-mono font-bold text-white">{q.quoteNumber}</td>
                      <td className="p-3 text-slate-200">{customerName(q)}</td>
                      <td className="p-3 text-slate-400 text-[11px]">
                        {q.validUntil ? (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-slate-500" />
                            {new Date(q.validUntil).toLocaleDateString('es-VE')}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-white">
                        {formatUSD(Number(q.totalUSD) || 0)}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-300">
                        {formatVES(Number(q.totalVES) || 0)}
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant={badge.variant} size="sm">
                          {badge.label}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {q.status !== 'converted' && q.status !== 'rejected' && (
                            <ShareDocButtons
                              collection="quotes"
                              tenantId={tenantId}
                              documentId={q.id}
                              docLabel={q.quoteNumber || `COT-${q.id}`}
                              defaultEmail={customerEmail(q)}
                            />
                          )}
                          {(q.status === 'draft' || q.status === 'sent') && (
                            <button
                              onClick={() => {
                                setEditingQuote(q);
                                setIsQuoteModalOpen(true);
                              }}
                              className="text-slate-400 hover:text-white text-[11px] font-semibold px-2 py-1"
                            >
                              Editar
                            </button>
                          )}
                          {convertible(q) && (
                            <button
                              onClick={() => setConvertQuote(q)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600 hover:text-white font-semibold"
                            >
                              <ArrowRightLeft className="h-3 w-3" />
                              <span>Convertir</span>
                            </button>
                          )}
                          {statusActions(q).map((status) => (
                            <button
                              key={status}
                              onClick={() => handleStatus(q.id, status as 'sent' | 'accepted' | 'rejected')}
                              disabled={busyQuoteId === q.id}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded font-semibold border ${
                                status === 'rejected'
                                  ? 'bg-rose-600/10 text-rose-300 border-rose-500/30 hover:bg-rose-600 hover:text-white'
                                  : 'bg-emerald-600/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-600 hover:text-white'
                              }`}
                            >
                              {status === 'rejected' ? (
                                <Ban className="h-3 w-3" />
                              ) : (
                                <ArrowRightLeft className="h-3 w-3" />
                              )}
                              <span>
                                {status === 'sent'
                                  ? 'Enviar'
                                  : status === 'accepted'
                                    ? 'Aceptar'
                                    : 'Rechazar'}
                              </span>
                            </button>
                          ))}
                          {q.status === 'converted' &&
                            typeof q.convertedInvoice === 'object' &&
                            q.convertedInvoice !== null && (
                              <span className="text-[10px] text-slate-500 font-mono">
                                → {(q.convertedInvoice as { invoiceNumber: string }).invoiceNumber}
                              </span>
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

      {/* Modales */}
      <QuoteModal
        isOpen={isQuoteModalOpen}
        onClose={() => {
          setIsQuoteModalOpen(false);
          setEditingQuote(undefined);
        }}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        customers={customers}
        products={products}
        rate={effectiveRate}
        initial={
          editingQuote
            ? {
                id: editingQuote.id,
                customerId:
                  typeof editingQuote.customer === 'object' && editingQuote.customer !== null
                    ? editingQuote.customer.id
                    : Number(editingQuote.customer),
                items: (Array.isArray(editingQuote.items) ? editingQuote.items : []).map((it) => ({
                  productId:
                    typeof it.product === 'object' && it.product !== null
                      ? it.product.id
                      : typeof it.product === 'number'
                        ? it.product
                        : undefined,
                  sku: it.sku || undefined,
                  description: it.description,
                  quantity: Number(it.quantity) || 1,
                  unitPriceUSD: Number(it.unitPriceUSD) || 0,
                })),
                validUntil: editingQuote.validUntil,
                notes: editingQuote.notes,
              }
            : null
        }
      />

      {convertQuote && (
        <ConvertQuoteModal
          isOpen
          onClose={() => setConvertQuote(undefined)}
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          quote={{
            id: convertQuote.id,
            quoteNumber: convertQuote.quoteNumber,
            totalUSD: Number(convertQuote.totalUSD) || 0,
            customerName: customerName(convertQuote),
          }}
          cashRegisters={cashRegisters}
          warehouses={warehouses}
        />
      )}
    </div>
  );
}
