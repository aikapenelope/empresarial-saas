'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ClipboardList,
  Plus,
  FileText,
  Ban,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatUSD, formatVES } from './format';
import { Badge } from './Badge';
import { OrderModal } from './modals/OrderModal';
import { OrderInvoiceModal } from './modals/OrderInvoiceModal';
import {
  cancelOrderAction,
  confirmOrderAction,
} from '@/actions/erpActions';
import type { Order } from '@/payload-types';

interface OrdersViewProps {
  tenantId: number;
  tenantSlug: string;
  orders: Order[];
  customers: Array<{ id: number; name: string; taxId: string; priceTier?: string | null }>;
  products: Array<{
    id: number;
    name: string;
    sku: string;
    priceUSD: number;
    priceTiers?: Array<{ tier: string; priceUSD: number }> | null;
  }>;
  cashRegisters: Array<{ id: number; name: string; code: string; currentStatus: string }>;
  warehouses: Array<{ id: number; name: string; code: string; isDefault?: boolean | null }>;
  effectiveRate: number;
}

const STATUS_BADGE: Record<string, { variant: 'slate' | 'amber' | 'emerald' | 'rose' | 'indigo'; label: string }> = {
  draft: { variant: 'slate', label: 'Borrador' },
  confirmed: { variant: 'amber', label: 'Confirmado' },
  invoiced: { variant: 'indigo', label: 'Facturado' },
  canceled: { variant: 'rose', label: 'Cancelado' },
};

export function OrdersView({
  tenantId,
  tenantSlug,
  orders,
  customers,
  products,
  cashRegisters,
  warehouses,
  effectiveRate,
}: OrdersViewProps) {
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | undefined>(undefined);
  const [invoicingOrder, setInvoicingOrder] = useState<Order | undefined>(undefined);
  const [busyOrderId, setBusyOrderId] = useState<number | undefined>(undefined);

  const openOrders = orders.filter((o) => o.status === 'draft' || o.status === 'confirmed');
  const pendingInvoicing = orders.filter((o) => o.status === 'confirmed');
  const pendingTotal = pendingInvoicing.reduce((acc, o) => acc + (Number(o.totalUSD) || 0), 0);

  const handleConfirm = async (orderId: number) => {
    setBusyOrderId(orderId);
    const res = await confirmOrderAction({ tenantId, tenantSlug, orderId });
    setBusyOrderId(undefined);
    if (res.success) {
      toast.success('Pedido confirmado: pendiente de despacho.');
    } else {
      toast.error(res.error || 'No se pudo confirmar el pedido.');
    }
  };

  const handleCancel = async (orderId: number) => {
    setBusyOrderId(orderId);
    const res = await cancelOrderAction({ tenantId, tenantSlug, orderId });
    setBusyOrderId(undefined);
    if (res.success) {
      toast.success('Pedido cancelado.');
    } else {
      toast.error(res.error || 'No se pudo cancelar el pedido.');
    }
  };

  const customerName = (o: Order) =>
    typeof o.customer === 'object' && o.customer !== null
      ? (o.customer as { name: string }).name
      : 'Cliente';

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
            <span className="text-xs font-semibold text-indigo-400">Pedidos</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Pedidos de Venta</h1>
          <p className="text-xs text-slate-400 mt-1">
            Pedidos confirmados pendientes de despacho: confirma, factura y da seguimiento sin tocar el inventario hasta facturar.
          </p>
        </div>

        <button
          onClick={() => setIsOrderModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>+ Nuevo Pedido</span>
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Pedidos Abiertos</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-white">{openOrders.length}</span>
            <span className="text-xs text-slate-400">borradores + confirmados</span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Por Facturar</p>
          <div className="mt-1 flex items-baseline gap-2 flex-wrap">
            <span className="text-xl font-bold text-amber-400">{pendingInvoicing.length}</span>
            <span className="text-xs text-slate-400">· {formatUSD(pendingTotal)}</span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Facturados / Cancelados</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-white">
              {orders.filter((o) => o.status === 'invoiced' || o.status === 'canceled').length}
            </span>
            <span className="text-xs text-slate-400">histórico cerrado</span>
          </div>
        </div>
      </div>

      {/* Listado */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden backdrop-blur">
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-white">Pedidos del Inquilino</h2>
          </div>
          <span className="text-xs text-slate-400">{orders.length} registro(s)</span>
        </div>

        {orders.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-10">
            No hay pedidos registrados todavía.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                  <th className="p-3">Nro.</th>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Tier</th>
                  <th className="p-3 text-right">Total (USD)</th>
                  <th className="p-3 text-right">Total (VES)</th>
                  <th className="p-3 text-center">Estado</th>
                  <th className="p-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {orders.map((o) => {
                  const badge = STATUS_BADGE[o.status] || STATUS_BADGE.draft;
                  const invoiceId =
                    typeof o.issuedInvoice === 'object' && o.issuedInvoice !== null
                      ? o.issuedInvoice.id
                      : o.issuedInvoice;
                  return (
                    <tr key={o.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3 font-mono font-bold text-white">
                        <Link
                          href={`/${tenantSlug}/erp/orders/${o.id}`}
                          className="hover:text-indigo-300 underline decoration-slate-700 underline-offset-2"
                        >
                          {o.orderNumber}
                        </Link>
                      </td>
                      <td className="p-3 text-slate-200">{customerName(o)}</td>
                      <td className="p-3 text-slate-400 text-[11px] uppercase">{o.priceTierSnapshot || 'retail'}</td>
                      <td className="p-3 text-right font-mono font-bold text-white">
                        {formatUSD(Number(o.totalUSD) || 0)}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-300">
                        {formatVES(Number(o.totalVES) || 0)}
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant={badge.variant} size="sm">
                          {badge.label}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {o.status === 'draft' && (
                            <>
                              <button
                                onClick={() => {
                                  setEditingOrder(o);
                                  setIsOrderModalOpen(true);
                                }}
                                className="text-slate-400 hover:text-white text-[11px] font-semibold px-2 py-1"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => handleConfirm(o.id)}
                                disabled={busyOrderId === o.id}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white font-semibold disabled:opacity-40"
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                <span>Confirmar</span>
                              </button>
                            </>
                          )}
                          {o.status === 'confirmed' && (
                            <>
                              <button
                                onClick={() => setInvoicingOrder(o)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600 hover:text-white font-semibold"
                              >
                                <FileText className="h-3 w-3" />
                                <span>Facturar</span>
                              </button>
                              <Link
                                href={`/${tenantSlug}/erp/orders/${o.id}`}
                                className="text-slate-400 hover:text-white text-[11px] font-semibold px-2 py-1"
                              >
                                Remisión
                              </Link>
                              <button
                                onClick={() => handleCancel(o.id)}
                                disabled={busyOrderId === o.id}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-rose-600/10 text-rose-300 border border-rose-500/30 hover:bg-rose-600 hover:text-white font-semibold disabled:opacity-40"
                              >
                                <Ban className="h-3 w-3" />
                                <span>Cancelar</span>
                              </button>
                            </>
                          )}
                          {invoiceId && (
                            <Link
                              href={`/${tenantSlug}/erp/invoices/${invoiceId}`}
                              className="text-indigo-400 hover:text-indigo-300 text-[11px] font-semibold px-2 py-1 underline decoration-slate-700 underline-offset-2"
                            >
                              Ver Factura
                            </Link>
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
      <OrderModal
        isOpen={isOrderModalOpen || Boolean(editingOrder)}
        onClose={() => {
          setIsOrderModalOpen(false);
          setEditingOrder(undefined);
        }}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        customers={customers}
        products={products}
        rate={effectiveRate}
        initial={editingOrder ? {
          id: editingOrder.id,
          customerId:
            typeof editingOrder.customer === 'object' && editingOrder.customer !== null
              ? editingOrder.customer.id
              : Number(editingOrder.customer),
          items: (Array.isArray(editingOrder.items) ? editingOrder.items : []).map((it) => ({
            productId:
              typeof it.product === 'object' && it.product !== null
                ? it.product.id
                : typeof it.product === 'number'
                  ? it.product
                  : undefined,
            sku: it.sku || undefined,
            description: it.description,
            quantity: Number(it.quantity) || 0,
            unitPriceUSD: Number(it.unitPriceUSD) || 0,
            discountPct: Number(it.discountPct) || 0,
          })),
          notes: editingOrder.notes,
        } : null}
      />

      {invoicingOrder && (
        <OrderInvoiceModal
          isOpen
          onClose={() => setInvoicingOrder(undefined)}
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          order={{
            id: invoicingOrder.id,
            orderNumber: invoicingOrder.orderNumber,
            totalUSD: Number(invoicingOrder.totalUSD) || 0,
            customerName: customerName(invoicingOrder),
          }}
          cashRegisters={cashRegisters}
          warehouses={warehouses}
        />
      )}
    </div>
  );
}
