'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Receipt,
  Search,
  Plus,
  DollarSign,
  Calendar,
  Clock,
  CheckCircle,
  Undo2,
  FileStack,
  Wallet,
  ListChecks,
} from 'lucide-react';
import { formatUSD, formatVES } from './format';
import { Badge } from './Badge';
import { KpiCard } from './KpiCard';
import { ErpPageHeader } from './ErpPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { InvoiceModal } from './modals/InvoiceModal';
import { PaymentModal } from './modals/PaymentModal';
import { ReturnModal } from './modals/ReturnModal';
import type { Invoice } from '@/payload-types';

interface InvoicesViewProps {
  tenantId: number;
  tenantSlug: string;
  invoices: Invoice[];
  customers: Array<{ id: number; name: string; taxId: string; currentDebtUSD?: number | null }>;
  products: Array<{ id: number; name: string; sku: string; priceUSD: number; unitOfMeasure: string }>;
  effectiveRate: number;
  cashRegisters: Array<{ id: number; name: string; code: string; currentStatus: string }>;
  warehouses: Array<{ id: number; name: string; code: string; isDefault?: boolean | null }>;
}

const STATUS_FILTERS = [
  { value: 'all', label: 'Todas' },
  { value: 'issued', label: 'Emitidas' },
  { value: 'partially_paid', label: 'Parciales' },
  { value: 'paid', label: 'Pagadas' },
] as const;

export function InvoicesView({
  tenantId,
  tenantSlug,
  invoices,
  customers,
  products,
  effectiveRate,
  cashRegisters,
  warehouses,
}: InvoicesViewProps) {
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [returnInvoice, setReturnInvoice] = useState<Invoice | undefined>(undefined);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | undefined>(undefined);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | undefined>(undefined);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'issued' | 'partially_paid' | 'paid'>('all');

  // Métricas
  let totalInvoicedUSD = 0;
  let totalBalanceUSD = 0;
  let paidCount = 0;

  for (const inv of invoices) {
    totalInvoicedUSD += Number(inv.totalUSD) || 0;
    totalBalanceUSD += Number(inv.balanceUSD) || 0;
    if (inv.status === 'paid') paidCount++;
  }

  const totalInvoicedVES = totalInvoicedUSD * effectiveRate;
  const totalBalanceVES = totalBalanceUSD * effectiveRate;

  // Filtrado reactivo
  const filteredInvoices = invoices.filter((inv) => {
    const customerName =
      typeof inv.customer === 'object' && inv.customer !== null
        ? (inv.customer as { name: string }).name
        : '';
    const customerTaxId =
      typeof inv.customer === 'object' && inv.customer !== null
        ? (inv.customer as { taxId?: string }).taxId || ''
        : '';

    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      customerName.toLowerCase().includes(search.toLowerCase()) ||
      customerTaxId.toLowerCase().includes(search.toLowerCase());

    const matchesStatus = statusFilter === 'all' ? true : inv.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Preparar lista de facturas para el modal de cobro
  const invoicesForPayment = invoices.map((inv) => {
    const custId =
      typeof inv.customer === 'object' && inv.customer !== null
        ? (inv.customer as { id: number }).id
        : Number(inv.customer);
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerId: custId,
      balanceUSD: Number(inv.balanceUSD) || 0,
      balanceVES: Number(inv.balanceVES) || 0,
    };
  });

  const handleOpenCollect = (inv: Invoice) => {
    const custId =
      typeof inv.customer === 'object' && inv.customer !== null
        ? (inv.customer as { id: number }).id
        : Number(inv.customer);
    setSelectedInvoiceId(inv.id);
    setSelectedCustomerId(custId);
    setIsPaymentModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <ErpPageHeader
        title="Facturas de Venta & Cobranzas Bimonetarias"
        description="Emisión de facturas fiscales y comerciales (USD/VES), control de vencimientos y registro multimétodo de cobranza."
        breadcrumbHref={`/${tenantSlug}/erp`}
        section="Facturación & Ventas"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedInvoiceId(undefined);
                setSelectedCustomerId(undefined);
                setIsPaymentModalOpen(true);
              }}
            >
              <DollarSign className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              Registrar Cobro
            </Button>
            <Button size="sm" onClick={() => setIsInvoiceModalOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Nueva Venta
            </Button>
          </>
        }
      />

      {/* KPIs de Facturación */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Total Facturado"
          valueUSD={totalInvoicedUSD}
          valueVES={totalInvoicedVES}
          icon={FileStack}
        />
        <KpiCard
          title="Saldo Pendiente por Cobrar"
          valueUSD={totalBalanceUSD}
          valueVES={totalBalanceVES}
          icon={Wallet}
          tone="warning"
        />
        <KpiCard
          title="Estado de Documentos"
          valueUSD={String(invoices.length)}
          icon={ListChecks}
          description={`${paidCount} pagadas / ${invoices.length - paidCount} con saldo`}
        />
      </div>

      {/* Barra de Búsqueda y Filtros */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por factura, cliente o RIF..."
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          {STATUS_FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={statusFilter === f.value ? 'default' : 'outline'}
              onClick={() => setStatusFilter(f.value)}
            >
              {f.value === 'all' ? `${f.label} (${invoices.length})` : f.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Tabla de Facturas */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {filteredInvoices.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-xs space-y-3">
            <Receipt className="h-8 w-8 mx-auto text-muted-foreground/50" aria-hidden="true" />
            <p>No se encontraron facturas registradas.</p>
            <Button size="sm" onClick={() => setIsInvoiceModalOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Emitir Primera Factura
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Factura</TableHead>
                  <TableHead>Cliente / RIF</TableHead>
                  <TableHead>Emisión & Vencimiento</TableHead>
                  <TableHead>Términos</TableHead>
                  <TableHead className="text-right">Total Facturado</TableHead>
                  <TableHead className="text-right">Saldo Pendiente</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-center">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.map((inv) => {
                  const customerName =
                    typeof inv.customer === 'object' && inv.customer !== null
                      ? (inv.customer as { name: string }).name
                      : 'Cliente General';
                  const customerTaxId =
                    typeof inv.customer === 'object' && inv.customer !== null
                      ? (inv.customer as { taxId?: string }).taxId || ''
                      : '';

                  const balance = Number(inv.balanceUSD) || 0;
                  const balanceVES = Number(inv.balanceVES) || balance * effectiveRate;
                  const isPaid = inv.status === 'paid' || balance <= 0;

                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono font-bold">
                        <Link
                          href={`/${tenantSlug}/erp/invoices/${inv.id}`}
                          className="flex items-center gap-1.5 hover:underline underline-offset-2"
                          title="Ver detalle de la factura"
                        >
                          <Receipt className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                          {inv.invoiceNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-foreground">{customerName}</div>
                        <div className="text-[11px] font-mono text-muted-foreground">{customerTaxId}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <div className="flex items-center gap-1 text-[11px]">
                          <Calendar className="h-3 w-3" aria-hidden="true" />
                          <span>{new Date(inv.issueDate).toLocaleDateString('es-VE')}</span>
                        </div>
                        {inv.dueDate && (
                          <div className="flex items-center gap-1 text-[10px] opacity-80 mt-0.5">
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            <span>Vence: {new Date(inv.dueDate).toLocaleDateString('es-VE')}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="capitalize text-[11px] font-medium text-muted-foreground">
                          {inv.paymentTerms === 'cash' ? 'Contado' : 'Crédito'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <div className="font-bold">{formatUSD(Number(inv.totalUSD) || 0)}</div>
                        <div className="text-[10px] text-muted-foreground">
                          ≈ {formatVES(Number(inv.totalVES) || 0)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold">
                        {balance > 0 ? (
                          <>
                            <div className="text-amber-600 dark:text-amber-400">{formatUSD(balance)}</div>
                            <div className="text-[10px] font-normal text-muted-foreground">≈ {formatVES(balanceVES)}</div>
                          </>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">$ 0,00</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
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
                          dot
                        >
                          {inv.status === 'paid'
                            ? 'Pagada'
                            : inv.status === 'partially_paid'
                              ? 'Parcial'
                              : inv.status === 'voided'
                                ? 'Anulada'
                                : 'Emitida'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {!isPaid && (
                            <Button
                              size="sm"
                              className="h-7 px-2.5 text-[11px]"
                              onClick={() => handleOpenCollect(inv)}
                            >
                              <DollarSign className="h-3 w-3" aria-hidden="true" />
                              Cobrar
                            </Button>
                          )}
                          {isPaid && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                              <CheckCircle className="h-3 w-3" aria-hidden="true" />
                              <span>Completa</span>
                            </span>
                          )}
                          {inv.status !== 'voided' &&
                            inv.status !== 'draft' &&
                            (Array.isArray(inv.items) ? inv.items : []).some(
                              (it) => typeof it.product === 'object' && it.product !== null,
                            ) && (
                              <Button
                                size="sm"
                                variant="outline"
                                title="Registrar devolución de mercancía"
                                className="h-7 px-2 text-[11px]"
                                onClick={() => setReturnInvoice(inv)}
                              >
                                <Undo2 className="h-3 w-3" aria-hidden="true" />
                                Devolver
                              </Button>
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

      {/* Modal Nueva Factura */}
      <InvoiceModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        customers={customers}
        products={products}
        rate={effectiveRate}
        cashRegisters={cashRegisters}
        warehouses={warehouses}
      />

      {/* Modal Devolución */}
      {returnInvoice && (
        <ReturnModal
          isOpen
          onClose={() => setReturnInvoice(undefined)}
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          invoice={{
            id: returnInvoice.id,
            invoiceNumber: returnInvoice.invoiceNumber,
            items: (Array.isArray(returnInvoice.items) ? returnInvoice.items : []).map((it) => ({
              productId:
                typeof it.product === 'object' && it.product !== null
                  ? it.product.id
                  : typeof it.product === 'number'
                    ? it.product
                    : undefined,
              description: it.description,
              quantity: Number(it.quantity) || 0,
            })),
          }}
        />
      )}

      {/* Modal Cobro */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        rate={effectiveRate}
        customers={customers}
        invoices={invoicesForPayment}
        defaultCustomerId={selectedCustomerId}
        defaultInvoiceId={selectedInvoiceId}
      />
    </div>
  );
}
