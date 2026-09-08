'use client';

import React, { useState, useTransition } from 'react';
import { useSyncOnKeyChange } from '../hooks/useSyncOnKeyChange';
import { Modal } from './Modal';
import { toast } from 'sonner';
import {
  createPaymentAction,
  deleteOrphanReceiptAction,
  uploadReceiptAction,
} from '@/actions/erpActions';
import { formatUSD, formatVES } from '../format';
import { Loader2 } from 'lucide-react';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: number;
  tenantSlug: string;
  rate: number;
  customers: Array<{ id: number; name: string; taxId: string; currentDebtUSD?: number | null }>;
  invoices?: Array<{ id: number; invoiceNumber: string; customerId: number; balanceUSD: number; balanceVES: number }>;
  defaultCustomerId?: number;
  defaultInvoiceId?: number;
}

export function PaymentModal({
  isOpen,
  onClose,
  tenantId,
  tenantSlug,
  rate,
  customers,
  invoices = [],
  defaultCustomerId,
  defaultInvoiceId,
}: PaymentModalProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState<number>(defaultCustomerId || customers[0]?.id || 0);
  const [invoiceId, setInvoiceId] = useState<number | undefined>(defaultInvoiceId);
  const [amountUSD, setAmountUSD] = useState<number>(10);
  const [method, setMethod] = useState<
    'cash_usd' | 'cash_ves' | 'pos_ves' | 'pago_movil' | 'transfer_ves' | 'zelle' | 'binance'
  >('cash_usd');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');

  // Reiniciar SIEMPRE la selección cuando el modal se abre o cambian los defaults:
  // una apertura "abono general" debe limpiar la factura de una sesión anterior,
  // y una apertura con factura específica debe fijar cliente + saldo. Incluye la
  // transición a undefined y la limpieza tras un envío exitoso. Ajuste de estado
  // en render (patrón oficial de React) en lugar de useEffect.
  useSyncOnKeyChange(
    `${isOpen}:${defaultCustomerId ?? 'none'}:${defaultInvoiceId ?? 'none'}`,
    () => {
      if (!isOpen) return;

      setError(null);
      setReferenceNumber('');
      setNotes('');
      setReceiptFile(null);
      setAmountUSD(10);

      const inv = defaultInvoiceId ? invoices.find((i) => i.id === defaultInvoiceId) : undefined;
      setInvoiceId(inv ? inv.id : undefined);
      setCustomerId(
        defaultCustomerId ?? inv?.customerId ?? customers[0]?.id ?? 0,
      );

      if (inv) {
        setAmountUSD(Number(inv.balanceUSD) || 10);
      }
    },
  );

  // Filtrar facturas con saldo del cliente seleccionado
  const customerInvoices = invoices.filter((inv) => inv.customerId === customerId && inv.balanceUSD > 0);

  const isUSDMethod = method === 'cash_usd' || method === 'zelle' || method === 'binance';
  const amountNative = isUSDMethod ? amountUSD : amountUSD * rate;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) {
      setError('Debes seleccionar un cliente.');
      return;
    }
    if (amountUSD <= 0) {
      setError('El monto a cobrar debe ser mayor a 0.');
      return;
    }

    setError(null);

    startTransition(async () => {
      let receiptMediaId: number | undefined;
      if (receiptFile) {
        const fd = new FormData();
        fd.append('file', receiptFile);
        fd.append('tenantId', String(tenantId));
        const upload = await uploadReceiptAction(fd);
        if (!upload.success) {
          setError(upload.error || 'Error al subir el comprobante.');
          return;
        }
        receiptMediaId = upload.mediaId;
      }

      const res = await createPaymentAction({
        tenantId,
        tenantSlug,
        customerId,
        invoiceId: invoiceId ? Number(invoiceId) : undefined,
        amountUSD,
        method,
        receiptMediaId,
        referenceNumber: referenceNumber || undefined,
        notes: notes || undefined,
      });

      if (!res.success && receiptMediaId) {
        // Flujo coordinado cobro+comprobante: si el cobro falla, el recibo ya
        // subido se elimina para no dejar archivos huérfanos en cada intento.
        await deleteOrphanReceiptAction(tenantId, receiptMediaId);
      }

      if (res.success) {
        toast.success('Cobro registrado correctamente.');
        setReceiptFile(null);
        setAmountUSD(10);
        setReferenceNumber('');
        setNotes('');
        setInvoiceId(undefined);
        setCustomerId(customers[0]?.id ?? 0);
        onClose();
      } else {
        setError(res.error || 'Error al procesar cobro');
      }
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Registrar Cobro / Abono a Cuenta"
      description="Ingreso de cobro bimonetario multimétodo (Efectivo USD/VES, Pago Móvil, Punto, Zelle o Binance)."
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-rose-300">
            {error}
          </div>
        )}

        {/* Cliente */}
        <div>
          <label className="block font-semibold text-slate-300 mb-1">Cliente / Deudor *</label>
          <select
            value={customerId}
            onChange={(e) => {
              const cid = Number(e.target.value);
              setCustomerId(cid);
              setInvoiceId(undefined);
            }}
            className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.taxId}) - Deuda:{' '}
                {formatUSD(Number(c.currentDebtUSD) || 0)}
              </option>
            ))}
          </select>
        </div>

        {/* Factura Opcional para Imputar */}
        {customerInvoices.length > 0 && (
          <div>
            <label className="block font-semibold text-slate-300 mb-1">
              Imputar a Factura Específica (Opcional)
            </label>
            <select
              value={invoiceId || ''}
              onChange={(e) => {
                const val = e.target.value ? Number(e.target.value) : undefined;
                setInvoiceId(val);
                if (val) {
                  const selectedInv = customerInvoices.find((i) => i.id === val);
                  if (selectedInv) setAmountUSD(selectedInv.balanceUSD);
                }
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none font-mono"
            >
              <option value="">-- Abono general al saldo del cliente --</option>
              {customerInvoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoiceNumber} — Saldo pendiente: {formatUSD(inv.balanceUSD)} (≈{' '}
                  {formatVES(inv.balanceVES)})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Método y Monto */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-300 mb-1">Método de Cobro *</label>
            <select
              value={method}
              onChange={(e) =>
                setMethod(
                  e.target.value as
                    | 'cash_usd'
                    | 'cash_ves'
                    | 'pos_ves'
                    | 'pago_movil'
                    | 'transfer_ves'
                    | 'zelle'
                    | 'binance',
                )
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="cash_usd">Efectivo USD ($)</option>
              <option value="cash_ves">Efectivo Bolívares (Bs.)</option>
              <option value="pago_movil">Pago Móvil (VES)</option>
              <option value="pos_ves">Punto de Venta / Tarjeta (VES)</option>
              <option value="transfer_ves">Transferencia Bancaria (VES)</option>
              <option value="zelle">Zelle ($ USD)</option>
              <option value="binance">Binance Pay (USDT)</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-300 mb-1">Monto Cobrado (USD) *</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={amountUSD}
              onChange={(e) => setAmountUSD(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white font-mono focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Resumen de Conversión en Tiempo Real */}
        <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs">
          <div>
            <span className="text-slate-400">Contravalor a registrar en caja:</span>
            <div className="font-mono font-bold text-emerald-400 text-sm mt-0.5">
              {isUSDMethod ? formatUSD(amountNative) : formatVES(amountNative)}
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-500">Tasa de aplicación:</span>
            <div className="font-mono text-slate-300 text-xs">{formatVES(rate)}</div>
          </div>
        </div>

        {/* Referencia */}
        <div>
          <label className="block font-semibold text-slate-300 mb-1">
            Nro. de Referencia / Comprobante
          </label>
          <input
            type="text"
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
            placeholder="Ej. Ref #849202 o Últimos 4 dígitos de tarjeta"
            className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none font-mono"
          />
        </div>

        {/* Comprobante adjunto */}
        <div>
          <label className="block font-semibold text-slate-300 mb-1">
            Comprobante Digital (opcional, imagen o PDF ≤ 8 MB)
          </label>
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white file:mr-3 file:px-3 file:py-1 file:rounded file:border-0 file:bg-indigo-600 file:text-white text-[11px]"
          />
          {receiptFile && (
            <p className="text-[10px] text-slate-500 mt-1">Adjunto: {receiptFile.name}</p>
          )}
        </div>

        {/* Notas */}
        <div>
          <label className="block font-semibold text-slate-300 mb-1">Observaciones / Concepto</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Abono a cuenta corriente, recibido en turno mañana"
            className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        {/* Botones */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 font-semibold"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-all disabled:opacity-50"
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>Registrar Cobro</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
