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
  Globe,
  MessageCircle,
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
  filters: { from?: string; to?: string; status?: string; origin?: string };
  pagination: { page: number; totalPages: number; totalDocs: number };
  totals: { byStatus: Record<string, number>; total: number; totalUSD: number };
  customers: Array<{ id: number; name: string; taxId: string; phone?: string | null; priceTier?: string | null }>;
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

  const customerPhone = (q: Quote) => {
    if (typeof q.customer === 'object' && q.customer !== null && 'phone' in q.customer) {
      const p = (q.customer as { phone?: string | null }).phone;
      if (p) return p;
    }
    const custId =
      typeof q.customer === 'object' && q.customer !== null ? q.customer.id : Number(q.customer);
    const found = customers.find((c) => c.id === custId);
    return found?.phone ?? null;
  };

  const isWebQuote = (q: Quote) =>
    q.origin === 'storefront' ||
    (typeof q.notes === 'string' && q.notes.includes('[Pedido Web B2B]'));

  const buildOriginUrl = (origin?: string) => {
    const params = new URLSearchParams();
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.status) params.set('status', filters.status);
    if (origin) params.set('origin', origin);
    const qs = params.toString();
    return `/${tenantSlug}/erp/quotes${qs ? `?${qs}` : ''}`;
  };

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
        extraHiddenParams={{ origin: filters.origin }}
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
        <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">Cotizaciones del Inquilino</h2>
            <span className="text-xs text-muted-foreground">({pagination.totalDocs} registro(s))</span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <Button
              asChild
              variant={!filters.origin ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs rounded-full"
            >
              <Link href={buildOriginUrl(undefined)}>
                Todos
              </Link>
            </Button>
            <Button
              asChild
              variant={filters.origin === 'storefront' ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs rounded-full gap-1"
            >
              <Link href={buildOriginUrl('storefront')}>
                <Globe className="h-3 w-3" aria-hidden="true" />
                Solo Web B2B
              </Link>
            </Button>
            <Button
              asChild
              variant={filters.origin === 'manual' ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs rounded-full"
            >
              <Link href={buildOriginUrl('manual')}>
                Solo Mostrador / ERP
              </Link>
            </Button>
          </div>
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
                      <TableCell>
                        <div className="flex flex-col gap-1 items-start">
                          <span className="font-mono font-bold">{q.quoteNumber}</span>
                          {isWebQuote(q) ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border border-indigo-500/30">
                              <Globe className="h-2.5 w-2.5" aria-hidden="true" />
                              Web B2B
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground border border-border/50">
                              Mostrador
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-foreground">{customerName(q)}</span>
                          {customerPhone(q) && (
                            <span className="text-[11px] text-muted-foreground">
                              {customerPhone(q)}
                            </span>
                          )}
                        </div>
                      </TableCell>
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
                          {customerPhone(q) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px] text-emerald-600 dark:text-emerald-400 border-emerald-600/30 hover:bg-emerald-500/10 hover:border-emerald-600/50 gap-1"
                              asChild
                            >
                              <a
                                href={`https://wa.me/${customerPhone(q)!.replace(/\D/g, '')}?text=${encodeURIComponent(
                                  isWebQuote(q)
                                    ? `Hola ${customerName(q)}, te contactamos respecto a tu solicitud web ${q.quoteNumber || `COT-${q.id}`} por $${(Number(q.totalUSD) || 0).toFixed(2)} USD. Estamos confirmando disponibilidad de stock para coordinar la entrega.`
                                    : `Hola ${customerName(q)}, te contactamos respecto a la cotización ${q.quoteNumber || `COT-${q.id}`} por $${(Number(q.totalUSD) || 0).toFixed(2)} USD.`,
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={`Contactar a ${customerName(q)} por WhatsApp (${customerPhone(q)})`}
                              >
                                <MessageCircle className="h-3 w-3" aria-hidden="true" />
                                <span>WhatsApp</span>
                              </a>
                            </Button>
                          )}
                          {q.status !== 'converted' && q.status !== 'rejected' && (
                            <ShareDocButtons
                              collection="quotes"
                              tenantId={tenantId}
                              documentId={q.id}
                              docLabel={q.quoteNumber || `COT-${q.id}`}
                              defaultEmail={customerEmail(q)}
                              defaultPhone={customerPhone(q)}
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
