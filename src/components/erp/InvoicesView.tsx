'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Receipt,
  Search,
  Plus,
  DollarSign,
  Calendar,
  Clock,
  CheckCircle,
  Undo2,} from 'lucide-react';
import { formatUSD, formatVES } from './KpiCard';
import { Badge } from './Badge';
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
            <span className="text-xs font-semibold text-indigo-400">Facturación & Ventas</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Facturas de Venta & Cobranzas Bimonetarias
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Emisión de facturas fiscales y comerciales (USD/VES), control de vencimientos y registro multimétodo de cobranza.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setSelectedInvoiceId(undefined);
              setSelectedCustomerId(undefined);
              setIsPaymentModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
            <span>Registrar Cobro</span>
          </button>
          <button
            onClick={() => setIsInvoiceModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors shadow-sm shadow-indigo-500/20"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>+ Nueva Venta</span>
          </button>
        </div>
      </div>

      {/* KPIs de Facturación */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Total Facturado</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-white">{formatUSD(totalInvoicedUSD)}</span>
            <span className="text-xs font-medium text-slate-400">≈ {formatVES(totalInvoicedVES)}</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Saldo Pendiente por Cobrar</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-amber-400">{formatUSD(totalBalanceUSD)}</span>
            <span className="text-xs font-medium text-emerald-400">≈ {formatVES(totalBalanceVES)}</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Estado de Documentos</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-white">{invoices.length}</span>
            <span className="text-xs text-slate-400">
              ({paidCount} pagadas / {invoices.length - paidCount} con saldo)
            </span>
          </div>
        </div>
      </div>

      {/* Barra de Búsqueda y Filtros */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por factura, cliente o RIF..."
            className="w-full rounded-lg border border-slate-800 bg-slate-900/80 pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto text-xs">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              statusFilter === 'all'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            Todas ({invoices.length})
          </button>
          <button
            onClick={() => setStatusFilter('issued')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              statusFilter === 'issued'
                ? 'bg-amber-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            Emitidas
          </button>
          <button
            onClick={() => setStatusFilter('partially_paid')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              statusFilter === 'partially_paid'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            Parciales
          </button>
          <button
            onClick={() => setStatusFilter('paid')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              statusFilter === 'paid'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            Pagadas
          </button>
        </div>
      </div>

      {/* Tabla de Facturas */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden backdrop-blur">
        {filteredInvoices.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs space-y-3">
            <Receipt className="h-8 w-8 mx-auto text-slate-600" />
            <p>No se encontraron facturas registradas.</p>
            <button
              onClick={() => setIsInvoiceModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              + Emitir Primera Factura
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                  <th className="p-3">Factura</th>
                  <th className="p-3">Cliente / RIF</th>
                  <th className="p-3">Emisión & Vencimiento</th>
                  <th className="p-3">Términos</th>
                  <th className="p-3 text-right">Total Facturado</th>
                  <th className="p-3 text-right">Saldo Pendiente</th>
                  <th className="p-3 text-center">Estado</th>
                  <th className="p-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
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
                    <tr key={inv.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3 font-mono font-bold text-white">
                        <div className="flex items-center gap-1.5">
                          <Receipt className="h-3.5 w-3.5 text-indigo-400" />
                          <span>{inv.invoiceNumber}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-white">{customerName}</div>
                        <div className="text-[11px] font-mono text-slate-400">{customerTaxId}</div>
                      </td>
                      <td className="p-3 text-slate-300">
                        <div className="flex items-center gap-1 text-[11px]">
                          <Calendar className="h-3 w-3 text-slate-500" />
                          <span>{new Date(inv.issueDate).toLocaleDateString('es-VE')}</span>
                        </div>
                        {inv.dueDate && (
                          <div className="flex items-center gap-1 text-[10px] text-slate-500 mt-0.5">
                            <Clock className="h-3 w-3" />
                            <span>Vence: {new Date(inv.dueDate).toLocaleDateString('es-VE')}</span>
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="capitalize text-[11px] font-medium text-slate-300">
                          {inv.paymentTerms === 'cash' ? 'Contado' : 'Crédito'}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono">
                        <div className="font-bold text-white">{formatUSD(Number(inv.totalUSD) || 0)}</div>
                        <div className="text-[10px] text-slate-400">
                          ≈ {formatVES(Number(inv.totalVES) || 0)}
                        </div>
                      </td>
                      <td className="p-3 text-right font-mono font-bold">
                        {balance > 0 ? (
                          <>
                            <div className="text-amber-400">{formatUSD(balance)}</div>
                            <div className="text-[10px] text-slate-400">≈ {formatVES(balanceVES)}</div>
                          </>
                        ) : (
                          <span className="text-emerald-400 font-semibold">$ 0,00</span>
                        )}
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
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {!isPaid && (
                            <button
                              onClick={() => handleOpenCollect(inv)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold transition-colors"
                            >
                              <DollarSign className="h-3 w-3" />
                              <span>Cobrar</span>
                            </button>
                          )}
                          {isPaid && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                              <CheckCircle className="h-3 w-3" />
                              <span>Completa</span>
                            </span>
                          )}
                          {inv.status !== 'voided' &&
                            inv.status !== 'draft' &&
                            (Array.isArray(inv.items) ? inv.items : []).some(
                              (it) => typeof it.product === 'object' && it.product !== null,
                            ) && (
                              <button
                                onClick={() => setReturnInvoice(inv)}
                                title="Registrar devolución de mercancía"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-600/10 text-amber-300 border border-amber-500/30 hover:bg-amber-600 hover:text-white text-[11px] font-semibold transition-colors"
                              >
                                <Undo2 className="h-3 w-3" />
                                <span>Devolver</span>
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

      {/* Modal Cobro */}
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
