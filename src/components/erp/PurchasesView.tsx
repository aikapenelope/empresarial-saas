'use client';

import React, { useState } from 'react';
import {
  Truck,
  Plus,
  PackageCheck,
  Wallet,
  Loader2,
  HandCoins,
  Timer,
  ReceiptText,
} from 'lucide-react';
import { formatUSD } from './format';
import { Badge } from './Badge';
import { KpiCard } from './KpiCard';
import { ErpPageHeader } from './ErpPageHeader';
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
  invoicePage: { docs: PurchaseInvoice[]; page: number; totalPages: number; totalDocs: number };
  filters: { from?: string; to?: string; status?: string };
  pagination: { page: number; totalPages: number; totalDocs: number };
  effectiveRate: number;
  products: Array<{ id: number; name: string; sku: string; costUSD: number; productType: string | null }>;
  warehouses: Array<{
    id: number;
    name: string;
    code: string;
    isActive?: boolean | null;
    isDefault?: boolean | null;
  }>;
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
  invoicePage,
  filters,
  pagination,
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
      <ErpPageHeader
        title="Compras & Cuentas por Pagar"
        description="Registra compras, recepciona mercancía (entra al Kardex) y paga a tus proveedores."
        breadcrumbHref={`/${tenantSlug}/erp`}
        section="Compras & CxP"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => handleOpenPayment()}>
              <Wallet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              Pagar Proveedor
            </Button>
            <Button size="sm" onClick={() => setIsPurchaseModalOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Registrar Compra
            </Button>
          </>
        }
      />

      {receiveError && (
        <div
          className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400"
          role="alert"
        >
          {receiveError}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Cuentas por Pagar"
          valueUSD={totalPayablesUSD}
          valueVES={totalPayablesUSD * effectiveRate}
          icon={HandCoins}
          tone="destructive"
        />
        <KpiCard
          title="Pendiente de Recepción"
          valueUSD={String(pendingReceptionCount)}
          icon={Timer}
          tone="warning"
          description="Compra(s) sin recibir"
        />
        <KpiCard
          title="Pagos Recientes"
          valueUSD={String(supplierPayments.length)}
          icon={ReceiptText}
          description="Últimos 50 pagos a proveedores"
        />
      </div>

      {/* Facturas de compra */}
      <BusinessFiltersBar
        basePath={`/${tenantSlug}/erp/purchases`}
        current={filters}
        statusOptions={[
          { value: 'draft', label: 'Borrador' },
          { value: 'received', label: 'Recibida' },
          { value: 'partially_paid', label: 'Parcial' },
          { value: 'paid', label: 'Pagada' },
          { value: 'voided', label: 'Anulada' },
        ]}
        statusLabel="Estado"
        pagination={pagination}
      />

<div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">Facturas de Compra</h2>
          </div>
          <span className="text-xs text-muted-foreground">{invoicePage.totalDocs} registro(s)</span>
        </div>

        {invoicePage.docs.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-10">
            No hay compras registradas todavía.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Nro.</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead className="text-right">Total USD</TableHead>
                  <TableHead className="text-right">Saldo USD</TableHead>
                  <TableHead className="text-center">Recepción</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoicePage.docs.map((inv) => {
                  const balance = Number(inv.balanceUSD) || 0;
                  const canReceive =
                    inv.receptionStatus === 'pending' && inv.status !== 'voided';
                  const canPay =
                    balance > 0 &&
                    (inv.status === 'received' || inv.status === 'partially_paid');
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono font-bold">{inv.invoiceNumber}</TableCell>
                      <TableCell>{supplierName(inv)}</TableCell>
                      <TableCell className="text-muted-foreground text-[11px]">
                        {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('es-VE') : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatUSD(Number(inv.totalUSD) || 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400">{formatUSD(balance)}</TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={inv.receptionStatus === 'received' ? 'emerald' : 'amber'}
                          size="sm"
                          dot={inv.receptionStatus === 'received'}
                        >
                          {inv.receptionStatus === 'received' ? 'Recibida' : 'Pendiente'}
                        </Badge>
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
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {canReceive && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => handleReceive(inv)}
                              disabled={receivingId === inv.id}
                              title="Recepcionar mercancía (ingresa al Kardex)"
                            >
                              {receivingId === inv.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                              ) : (
                                <PackageCheck className="h-3 w-3" aria-hidden="true" />
                              )}
                              <span>Recibir</span>
                            </Button>
                          )}
                          {canPay && (
                            <Button
                              size="sm"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => handleOpenPayment(inv)}
                            >
                              <Wallet className="h-3 w-3" aria-hidden="true" />
                              <span>Pagar</span>
                            </Button>
                          )}
                          {!canReceive && !canPay && <span className="text-muted-foreground">—</span>}
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

      {/* Pagos a proveedores */}
      {supplierPayments.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Pagos a Proveedores</h2>
            <span className="text-xs text-muted-foreground">{supplierPayments.length} pago(s)</span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Recibo</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Monto USD</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplierPayments.map((p) => {
                  const supName =
                    typeof p.supplier === 'object' && p.supplier !== null ? p.supplier.name : '—';
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono font-bold">{p.paymentNumber}</TableCell>
                      <TableCell>{supName}</TableCell>
                      <TableCell className="text-muted-foreground text-[11px]">
                        {new Date(p.paymentDate).toLocaleDateString('es-VE')}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {formatUSD(Number(p.totalUSD) || 0)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="emerald" size="sm" dot>
                          {p.status === 'confirmed' ? 'Confirmado' : p.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Modal de selección de almacén para recepción diferida */}
      {receivingInvoice && (
        <ReceiveWarehouseModal
          isOpen
          onClose={() => setReceivingInvoice(undefined)}
          invoiceNumber={receivingInvoice.invoiceNumber}
          warehouses={warehouses
            .filter((w) => w.isActive !== false)
            .map((w) => ({ id: w.id, name: w.name, code: w.code }))}
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
        warehouses={warehouses.filter((w) => w.isActive !== false)}
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
