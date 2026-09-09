'use client';

import React, { useState, useTransition } from 'react';
import { useSyncOnKeyChange } from '../hooks/useSyncOnKeyChange';
import { Modal } from './Modal';
import { createSupplierPaymentAction } from '@/actions/erpActions';
import { formatUSD } from '../format';
import { Loader2 } from 'lucide-react';

interface SupplierPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: number;
  tenantSlug: string;
  suppliers: Array<{ id: number; name: string; taxId: string }>;
  purchaseInvoices: Array<{
    id: number;
    invoiceNumber: string;
    supplier: number | { id: number };
    balanceUSD: number;
    status?: string | null;
    dueDate?: string | null;
  }>;
  defaultSupplierId?: number;
  defaultPurchaseInvoiceId?: number;
}

const PAYMENT_METHODS: Array<{ value: string; label: string }> = [
  { value: 'cash_usd', label: 'Efectivo USD ($)' },
  { value: 'cash_ves', label: 'Efectivo Bolívares (Bs.)' },
  { value: 'pos_ves', label: 'Punto de Venta / Tarjeta (VES)' },
  { value: 'pago_movil', label: 'Pago Móvil (VES)' },
  { value: 'transfer_ves', label: 'Transferencia Bancaria (VES)' },
  { value: 'zelle', label: 'Zelle ($ USD)' },
  { value: 'binance', label: 'Binance Pay (USDT)' },
];

export function SupplierPaymentModal({
  isOpen,
  onClose,
  tenantId,
  tenantSlug,
  suppliers,
  purchaseInvoices,
  defaultSupplierId,
  defaultPurchaseInvoiceId,
}: SupplierPaymentModalProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [supplierId, setSupplierId] = useState<number>(0);
  const [purchaseInvoiceId, setPurchaseInvoiceId] = useState<number | undefined>(undefined);
  const [amountUSD, setAmountUSD] = useState<number>(0);
  const [method, setMethod] = useState<string>('transfer_ves');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');

  // Reset al abrir: si vino desde "Pagar" de una factura, fija proveedor + monto
  // = saldo. Ajuste de estado en render (patrón oficial de React) en lugar de
  // useEffect.
  useSyncOnKeyChange(
    `${isOpen}:${defaultSupplierId ?? 'none'}:${defaultPurchaseInvoiceId ?? 'none'}`,
    () => {
      if (!isOpen) return;
      setError(null);
      setReferenceNumber('');
      setNotes('');
      setMethod('transfer_ves');

      const targetInvoice = defaultPurchaseInvoiceId
        ? purchaseInvoices.find((i) => i.id === defaultPurchaseInvoiceId)
        : undefined;

      setPurchaseInvoiceId(targetInvoice ? targetInvoice.id : undefined);
      setSupplierId(
        defaultSupplierId ??
          (targetInvoice
            ? typeof targetInvoice.supplier === 'object'
              ? (targetInvoice.supplier as { id: number }).id
              : Number(targetInvoice.supplier)
            : suppliers[0]?.id ?? 0),
      );
      setAmountUSD(
        targetInvoice ? Number(Number(targetInvoice.balanceUSD).toFixed(2)) : 0,
      );
    },
  );

  // Facturas abiertas del proveedor seleccionado
  const openInvoices = purchaseInvoices.filter(
    (inv) => {
      const invSupplierId =
        typeof inv.supplier === 'object' && inv.supplier !== null
          ? inv.supplier.id
          : Number(inv.supplier);
      return (
        invSupplierId === supplierId &&
        inv.balanceUSD > 0 &&
        (inv.status === 'received' || inv.status === 'partially_paid')
      );
    },
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) {
      setError('Debes seleccionar un proveedor.');
      return;
    }
    if (amountUSD <= 0) {
      setError('El monto a pagar debe ser mayor a 0.');
      return;
    }

    setError(null);

    startTransition(async () => {
      const res = await createSupplierPaymentAction({
        tenantId,
        tenantSlug,
        supplierId,
        amountUSD,
        method: method as 'transfer_ves',
        purchaseInvoiceId: purchaseInvoiceId || undefined,
        referenceNumber: referenceNumber || undefined,
        notes: notes || undefined,
      });

      if (res.success) {
        onClose();
      } else {
        setError(res.error || 'Error al registrar el pago');
      }
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Pagar a Proveedor"
      description="Sin factura específica, el pago se imputa FIFO por vencimiento sobre las facturas de compra abiertas."
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-rose-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-foreground mb-1">Proveedor *</label>
            <select
              value={supplierId}
              onChange={(e) => {
                setSupplierId(Number(e.target.value));
                setPurchaseInvoiceId(undefined);
              }}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground focus:border-ring focus:outline-none"
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.taxId})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-foreground mb-1">Monto (USD) *</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={amountUSD}
              onChange={(e) => setAmountUSD(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground font-mono focus:border-ring focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-foreground mb-1">Método de Pago *</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground focus:border-ring focus:outline-none"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-foreground mb-1">
              Imputar a Factura (opcional)
            </label>
            <select
              value={purchaseInvoiceId ?? ''}
              onChange={(e) =>
                setPurchaseInvoiceId(e.target.value ? Number(e.target.value) : undefined)
              }
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground focus:border-ring focus:outline-none font-mono"
            >
              <option value="">-- FIFO automático por vencimiento --</option>
              {openInvoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoiceNumber} — Saldo: {formatUSD(Number(inv.balanceUSD) || 0)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block font-semibold text-foreground mb-1">Nro. de Referencia</label>
          <input
            type="text"
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
            placeholder="Ej. Transferencia #849202"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none font-mono"
          />
        </div>

        <div>
          <label className="block font-semibold text-foreground mb-1">Notas</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej. Pago parcial orden de compra #123"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border hover:bg-background text-foreground font-semibold"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-all disabled:opacity-50"
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>Registrar Pago</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
