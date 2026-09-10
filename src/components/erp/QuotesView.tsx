'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  FileText,
  Plus,
  ArrowRightLeft,
  Ban,
  Calendar,
  Zap,
} from 'lucide-react';
import { EmptyState } from './EmptyState';
import { formatUSD, formatVES } from './format';
import { Badge } from './Badge';
import { ErpPageHeader } from './ErpPageHeader';
import { QuoteFunnel } from './charts/QuoteFunnel';
import { BusinessFiltersBar } from './BusinessFiltersBar';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { QuoteModal } from './modals/QuoteModal';
import { ConvertQuoteModal } from './modals/ConvertQuoteModal';
import { ShareDocButtons } from './ShareDocButtons';
import { updateQuoteStatusAction } from '@/actions/erpActions';
import type { Quote } from '@/payload-types';

interface QuotesViewProps {
  tenantId: number;
  tenantSlug: string;
  quotes: Quote[];
  filters: { from?: string; to?: string; status?: string };
  pagination: { page: number; totalPages: number; totalDocs: number };
  totals: { byStatus: Record<string, number>; total: number; totalUSD: number };
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
  filters,
  pagination,
  totals,
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
      <ErpPageHeader
        title="Cotizaciones"
        description="Vender sin facturar: cotiza, hace seguimiento del estado y convierte a factura en un clic."
        breadcrumbHref={`/${tenantSlug}/erp`}
        section="Cotizaciones"
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/${tenantSlug}/erp/quotes/quick`}>
                <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                Cotización rápida
              </Link>
            </Button>
            <Button size="sm" onClick={() => setIsQuoteModalOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Nueva Cotización
            </Button>
          </>
        }
      />

      <BusinessFiltersBar
        basePath={`/${tenantSlug}/erp/quotes`}
        current={filters}
        statusOptions={[
          { value: 'draft', label: 'Borrador' },
          { value: 'sent', label: 'Enviada' },
          { value: 'accepted', label: 'Aceptada' },
          { value: 'rejected', label: 'Rechazada' },
          { value: 'expired', label: 'Expirada' },
          { value: 'converted', label: 'Convertida' },
        ]}
        statusLabel="Estado"
        pagination={pagination}
      />

      {/* Embudo comercial (pieza distintiva del módulo) */}
      {/* Embudo desde KPIs server-side (conjunto filtrado completo) */}
      <QuoteFunnel statusCounts={totals.byStatus} tenantSlug={tenantSlug} />

      {/* Listado */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">Cotizaciones del Inquilino</h2>
          </div>
          <span className="text-xs text-muted-foreground">{pagination.totalDocs} registro(s)</span>
        </div>

        {quotes.length === 0 ? (
          <EmptyState icon={FileText} title="No hay cotizaciones registradas todavía." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Nro.</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Válida Hasta</TableHead>
                  <TableHead className="text-right">Total (USD)</TableHead>
                  <TableHead className="text-right">Total (VES)</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.map((q) => {
                  const badge = STATUS_BADGE[q.status] || STATUS_BADGE.draft;
                  return (
                    <TableRow key={q.id}>
                      <TableCell className="font-mono font-bold">{q.quoteNumber}</TableCell>
                      <TableCell className="text-foreground">{customerName(q)}</TableCell>
                      <TableCell className="text-muted-foreground text-[11px]">
                        {q.validUntil ? (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" aria-hidden="true" />
                            {new Date(q.validUntil).toLocaleDateString('es-VE')}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold">
                        {formatUSD(Number(q.totalUSD) || 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {formatVES(Number(q.totalVES) || 0)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={badge.variant} size="sm" dot={q.status === 'accepted' || q.status === 'converted'}>
                          {badge.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
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
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => {
                                setEditingQuote(q);
                                setIsQuoteModalOpen(true);
                              }}
                            >
                              Editar
                            </Button>
                          )}
                          {convertible(q) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => setConvertQuote(q)}
                            >
                              <ArrowRightLeft className="h-3 w-3" aria-hidden="true" />
                              Convertir
                            </Button>
                          )}
                          {statusActions(q).map((status) => (
                            <Button
                              key={status}
                              size="sm"
                              variant={status === 'rejected' ? 'outline' : 'default'}
                              className="h-7 px-2 text-[11px]"
                              onClick={() => handleStatus(q.id, status as 'sent' | 'accepted' | 'rejected')}
                              disabled={busyQuoteId === q.id}
                            >
                              {status === 'rejected' ? (
                                <Ban className="h-3 w-3" aria-hidden="true" />
                              ) : (
                                <ArrowRightLeft className="h-3 w-3" aria-hidden="true" />
                              )}
                              <span>
                                {status === 'sent'
                                  ? 'Enviar'
                                  : status === 'accepted'
                                    ? 'Aceptar'
                                    : 'Rechazar'}
                              </span>
                            </Button>
                          ))}
                          {q.status === 'converted' &&
                            typeof q.convertedInvoice === 'object' &&
                            q.convertedInvoice !== null && (
                              <span className="text-[10px] text-muted-foreground font-mono">
                                → {(q.convertedInvoice as { invoiceNumber: string }).invoiceNumber}
                              </span>
                            )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
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
