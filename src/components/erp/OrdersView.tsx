'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ClipboardList,
  Plus,
  FileText,
  Ban,
  CheckCircle2,
  FolderOpen,
  Timer,
  Archive,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatUSD, formatVES } from './format';
import { Badge } from './Badge';
import { KpiCard } from './KpiCard';
import { ErpPageHeader } from './ErpPageHeader';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
      <ErpPageHeader
        title="Pedidos de Venta"
        description="Pedidos confirmados pendientes de despacho: confirma, factura y da seguimiento sin tocar el inventario hasta facturar."
        breadcrumbHref={`/${tenantSlug}/erp`}
        section="Pedidos"
        actions={
          <Button size="sm" onClick={() => setIsOrderModalOpen(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Nuevo Pedido
          </Button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Pedidos Abiertos"
          valueUSD={String(openOrders.length)}
          icon={FolderOpen}
          description="Borradores + confirmados"
        />
        <KpiCard
          title="Por Facturar"
          valueUSD={formatUSD(pendingTotal)}
          icon={Timer}
          tone="warning"
          description={`${pendingInvoicing.length} confirmado(s) pendiente(s) de factura`}
        />
        <KpiCard
          title="Facturados / Cancelados"
          valueUSD={String(orders.filter((o) => o.status === 'invoiced' || o.status === 'canceled').length)}
          icon={Archive}
          description="Histórico cerrado"
        />
      </div>

      {/* Listado */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">Pedidos del Inquilino</h2>
          </div>
          <span className="text-xs text-muted-foreground">{orders.length} registro(s)</span>
        </div>

        {orders.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-10">
            No hay pedidos registrados todavía.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Nro.</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">Total (USD)</TableHead>
                  <TableHead className="text-right">Total (VES)</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => {
                  const badge = STATUS_BADGE[o.status] || STATUS_BADGE.draft;
                  const invoiceId =
                    typeof o.issuedInvoice === 'object' && o.issuedInvoice !== null
                      ? o.issuedInvoice.id
                      : o.issuedInvoice;
                  return (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono font-bold">
                        <Link
                          href={`/${tenantSlug}/erp/orders/${o.id}`}
                          className="underline decoration-border underline-offset-2 hover:decoration-foreground"
                        >
                          {o.orderNumber}
                        </Link>
                      </TableCell>
                      <TableCell>{customerName(o)}</TableCell>
                      <TableCell className="text-muted-foreground text-[11px] uppercase">{o.priceTierSnapshot || 'retail'}</TableCell>
                      <TableCell className="text-right font-mono font-bold">
                        {formatUSD(Number(o.totalUSD) || 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {formatVES(Number(o.totalVES) || 0)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={badge.variant} size="sm" dot={o.status === 'confirmed' || o.status === 'invoiced'}>
                          {badge.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {o.status === 'draft' && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-[11px]"
                                onClick={() => {
                                  setEditingOrder(o);
                                  setIsOrderModalOpen(true);
                                }}
                              >
                                Editar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[11px]"
                                onClick={() => handleConfirm(o.id)}
                                disabled={busyOrderId === o.id}
                              >
                                <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                                <span>Confirmar</span>
                              </Button>
                            </>
                          )}
                          {o.status === 'confirmed' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[11px]"
                                onClick={() => setInvoicingOrder(o)}
                              >
                                <FileText className="h-3 w-3" aria-hidden="true" />
                                <span>Facturar</span>
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" asChild>
                                <Link href={`/${tenantSlug}/erp/orders/${o.id}`}>Remisión</Link>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[11px] text-rose-600 dark:text-rose-400"
                                onClick={() => handleCancel(o.id)}
                                disabled={busyOrderId === o.id}
                              >
                                <Ban className="h-3 w-3" aria-hidden="true" />
                                <span>Cancelar</span>
                              </Button>
                            </>
                          )}
                          {invoiceId && (
                            <Button size="sm" variant="link" className="h-7 px-2 text-[11px]" asChild>
                              <Link href={`/${tenantSlug}/erp/invoices/${invoiceId}`}>Ver Factura</Link>
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
