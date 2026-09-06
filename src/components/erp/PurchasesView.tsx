'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Truck,
  Plus,
  PackageCheck,
  Wallet,
  Loader2,
} from 'lucide-react';
import { formatUSD, formatVES } from './KpiCard';
import { Badge } from './Badge';
import { PurchaseInvoiceModal } from './modals/PurchaseInvoiceModal';
import { ReceiveWarehouseModal } from './modals/ReceiveWarehouseModal';
import { SupplierPaymentModal } from './modals/SupplierPaymentModal';
import { receivePurchaseGoodsAction } from '@/actions/erpActions';
import type { PurchasesPageData } from '@/utilities/erpData';
import type { PurchaseInvoice } from '@/payload-types';

interface PurchasesViewProps {
  tenantId: number;
  tenantSlug: string;
  data: PurchasesPageData;
  effectiveRate: number;
  products: Array<{ id: number; name: string; sku: string; costUSD: number }>;
  warehouses: Array<{ id: number; name: string; code: string; isDefault?: boolean | null }>;
}

function receptionWarehouseId(inv: PurchaseInvoice): number | null {
  if (typeof inv.receptionWarehouse === 'object' && inv.receptionWarehouse !== null) {
    return inv.receptionWarehouse.id;
  }
  return Number(inv.receptionWarehouse) || null;
}

export function PurchasesView({
  tenantId,
  tenantSlug,
  data,
  effectiveRate,
  products,
  warehouses,
}: PurchasesViewProps) {
  const { suppliers, purchaseInvoices, supplierPayments, totalPayablesUSD, pendingReceptionCount } =
    data;

  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentSupplierId, setPaymentSupplierId] = useState<number | undefined>(undefined);
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<number | undefined>(undefined);
  const [receivingId, setReceivingId] = useState<number | null>(null);
  const [receiveError, setReceiveError] = useState<string | null>(null);
  const [receivingInvoice, setReceivingInvoice] = useState<PurchaseInvoice | undefined>(undefined);

  const supplierName = (inv: PurchaseInvoice) =>
    typeof inv.supplier === 'object' && inv.supplier !== null ? inv.supplier.name : '—';

  const handleOpenPayment = (invoice?: PurchaseInvoice) => {
    if (invoice) {
      setPaymentSupplierId(
        typeof invoice.supplier === 'object' && invoice.supplier !== null
          ? invoice.supplier.id
          : Number(invoice.supplier) || undefined,
      );
      setPaymentInvoiceId(invoice.id);
    } else {
      setPaymentSupplierId(undefined);
      setPaymentInvoiceId(undefined);
    }
    setIsPaymentModalOpen(true);
  };

  const handleReceive = async (invoice: PurchaseInvoice, warehouseIdOverride?: number) => {
    const warehouseId = warehouseIdOverride ?? receptionWarehouseId(invoice);
    if (!warehouseId) {
      // Sin almacén asignado: abrir modal de selección al momento de recibir
      setReceivingInvoice(invoice);
      return;
    }
    if (
      !window.confirm(
        `Confirmar recepción de ${invoice.invoiceNumber}: la mercancía ingresará al Kardex del almacén indicado.`,
      )
    ) {
      return;
    }
    setReceivingId(invoice.id);
    setReceiveError(null);
    const res = await receivePurchaseGoodsAction({
      tenantId,
      tenantSlug,
      purchaseInvoiceId: invoice.id,
      warehouseId,
    });
    setReceivingId(null);
    if (!res.success) {
      setReceiveError(res.error || 'Error al recepcionar.');
    }
  };

  const handleReceiveWithWarehouse = async (warehouseId: number) => {
    if (!receivingInvoice) return;
    setReceivingId(receivingInvoice.id);
    setReceiveError(null);
    const res = await receivePurchaseGoodsAction({
      tenantId,
      tenantSlug,
      purchaseInvoiceId: receivingInvoice.id,
      warehouseId,
    });
    setReceivingId(null);
    if (res.success) {
      setReceivingInvoice(undefined);
    } else {
      setReceiveError(res.error || 'Error al recepcionar.');
    }
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
            <span className="text-xs font-semibold text-indigo-400">Compras & CxP</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Compras & Cuentas por Pagar
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Registra compras, recepciona mercancía (entra al Kardex) y paga a tus proveedores.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleOpenPayment()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-600/10 text-xs font-semibold text-emerald-300 hover:bg-emerald-600 hover:text-white transition-colors"
          >
            <Wallet className="h-3.5 w-3.5" />
            <span>Pagar Proveedor</span>
          </button>
          <button
            onClick={() => setIsPurchaseModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>+ Registrar Compra</span>
          </button>
        </div>
      </div>

      {receiveError && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">
          {receiveError}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Cuentas por Pagar</p>
          <div className="mt-1 flex items-baseline gap-2 flex-wrap">
            <span className="text-xl font-bold text-rose-400">{formatUSD(totalPayablesUSD)}</span>
            <span className="text-xs text-slate-400">
              ≈ {formatVES(totalPayablesUSD * effectiveRate)}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">
            Pendiente de Recepción
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-amber-400">{pendingReceptionCount}</span>
            <span className="text-xs text-slate-400">compra(s) sin recibir</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Pagos Registrados</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-white">{supplierPayments.length}</span>
            <span className="text-xs text-slate-400">a proveedores</span>
          </div>
        </div>
      </div>

      {/* Facturas de compra */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden backdrop-blur">
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-white">Facturas de Compra</h2>
          </div>
          <span className="text-xs text-slate-400">{purchaseInvoices.length} registro(s)</span>
        </div>

        {purchaseInvoices.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-10">
            No hay compras registradas todavía.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                  <th className="p-3">Nro.</th>
                  <th className="p-3">Proveedor</th>
                  <th className="p-3">Vence</th>
                  <th className="p-3 text-right">Total USD</th>
                  <th className="p-3 text-right">Saldo USD</th>
                  <th className="p-3 text-center">Recepción</th>
                  <th className="p-3 text-center">Estado</th>
                  <th className="p-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {purchaseInvoices.map((inv) => {
                  const balance = Number(inv.balanceUSD) || 0;
                  const whId = receptionWarehouseId(inv);
                  const canReceive =
                    inv.receptionStatus === 'pending' && inv.status !== 'voided';
                  const canPay =
                    balance > 0 &&
                    (inv.status === 'received' || inv.status === 'partially_paid');
                  return (
                    <tr key={inv.id} className="hover:bg-slate-800/30">
                      <td className="p-3 font-mono font-bold text-white">{inv.invoiceNumber}</td>
                      <td className="p-3 text-slate-200">{supplierName(inv)}</td>
                      <td className="p-3 text-slate-400 text-[11px]">
                        {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('es-VE') : '—'}
                      </td>
                      <td className="p-3 text-right font-mono text-white">
                        {formatUSD(Number(inv.totalUSD) || 0)}
                      </td>
                      <td className="p-3 text-right font-mono text-amber-400">{formatUSD(balance)}</td>
                      <td className="p-3 text-center">
                        <Badge
                          variant={inv.receptionStatus === 'received' ? 'emerald' : 'amber'}
                          size="sm"
                        >
                          {inv.receptionStatus === 'received' ? 'Recibida' : 'Pendiente'}
                        </Badge>
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
                                : inv.status === 'received'
                                  ? 'Recibida'
                                  : 'Borrador'}
                        </Badge>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {canReceive && (
                            <button
                              onClick={() => handleReceive(inv)}
                              disabled={receivingId === inv.id}
                              title="Recepcionar mercancía (ingresa al Kardex)"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-600/10 text-amber-300 border border-amber-500/30 hover:bg-amber-600 hover:text-white text-[11px] font-semibold disabled:opacity-50"
                            >
                              {receivingId === inv.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <PackageCheck className="h-3 w-3" />
                              )}
                              <span>Recibir</span>
                            </button>
                          )}
                          {canPay && (
                            <button
                              onClick={() => handleOpenPayment(inv)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold"
                            >
                              <Wallet className="h-3 w-3" />
                              <span>Pagar</span>
                            </button>
                          )}
                          {!canReceive && !canPay && <span className="text-slate-500">—</span>}
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

      {/* Pagos a proveedores */}
      {supplierPayments.length > 0 && (
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden backdrop-blur">
          <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Pagos a Proveedores</h2>
            <span className="text-xs text-slate-400">{supplierPayments.length} pago(s)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                  <th className="p-3">Recibo</th>
                  <th className="p-3">Proveedor</th>
                  <th className="p-3">Fecha</th>
                  <th className="p-3 text-right">Monto USD</th>
                  <th className="p-3 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {supplierPayments.map((p) => {
                  const supName =
                    typeof p.supplier === 'object' && p.supplier !== null ? p.supplier.name : '—';
                  return (
                    <tr key={p.id} className="hover:bg-slate-800/30">
                      <td className="p-3 font-mono font-bold text-white">{p.paymentNumber}</td>
                      <td className="p-3 text-slate-200">{supName}</td>
                      <td className="p-3 text-slate-400 text-[11px]">
                        {new Date(p.paymentDate).toLocaleDateString('es-VE')}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-400">
                        {formatUSD(Number(p.totalUSD) || 0)}
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant="emerald" size="sm">
                          {p.status === 'confirmed' ? 'Confirmado' : p.status}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de selección de almacén para recepción diferida */}
      {receivingInvoice && (
        <ReceiveWarehouseModal
          isOpen
          onClose={() => setReceivingInvoice(undefined)}
          invoiceNumber={receivingInvoice.invoiceNumber}
          warehouses={warehouses.map((w) => ({ id: w.id, name: w.name, code: w.code }))}
          onConfirm={handleReceiveWithWarehouse}
        />
      )}

      {/* Modales */}
      <PurchaseInvoiceModal
        isOpen={isPurchaseModalOpen}
        onClose={() => setIsPurchaseModalOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, taxId: s.taxId }))}
        products={products}
        warehouses={warehouses}
        rate={effectiveRate}
      />

      <SupplierPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, taxId: s.taxId }))}
        purchaseInvoices={purchaseInvoices}
        defaultSupplierId={paymentSupplierId}
        defaultPurchaseInvoiceId={paymentInvoiceId}
      />
    </div>
  );
}
