'use client';

import React, { useState } from 'react';
import { Modal } from './Modal';
import { issueInvoiceFromOrderAction } from '@/actions/erpActions';
import { Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner';

const CASH_METHODS = [
  { value: 'cash_usd', label: 'Efectivo USD' },
  { value: 'cash_ves', label: 'Efectivo Bs' },
  { value: 'pos_ves', label: 'Punto de Venta' },
  { value: 'pago_movil', label: 'Pago Móvil' },
  { value: 'transfer_ves', label: 'Transferencia Bs' },
  { value: 'zelle', label: 'Zelle' },
  { value: 'binance', label: 'Binance' },
];

interface InvoiceDeliveryNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: number;
  tenantSlug: string;
  note: { id: number; noteNumber: string; orderId: number };
  cashRegisters: Array<{ id: number; name: string; currentStatus: string }>;
  onInvoiced: () => void;
}

/**
 * Captura de pago para facturar una remisión (Sprint 41/Devin #57): el término
 * es explícito (contado exige método — nunca crédito implícito —; crédito no
 * cobra aquí) y la caja es opcional para contado.
 */
export function InvoiceDeliveryNoteModal({
  isOpen,
  onClose,
  tenantId,
  tenantSlug,
  note,
  cashRegisters,
  onInvoiced,
}: InvoiceDeliveryNoteModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentTerms, setPaymentTerms] = useState<'cash' | 'credit'>('cash');
  const [cashMethod, setCashMethod] = useState('cash_usd');
  const [cashRegisterId, setCashRegisterId] = useState<number | undefined>(undefined);

  const openRegisters = cashRegisters.filter((r) => r.currentStatus === 'open');

  const handleSubmit = async () => {
    if (paymentTerms === 'cash' && !cashMethod) {
      setError('Selecciona el método de pago para la venta de contado.');
      return;
    }
    setLoading(true);
    setError(null);
    const res = await issueInvoiceFromOrderAction({
      tenantId,
      tenantSlug,
      orderId: note.orderId,
      paymentTerms,
      ...(paymentTerms === 'cash' ? { cashMethod: cashMethod as 'cash_usd', cashRegisterId } : {}),
    });
    setLoading(false);
    if (res.success) {
      toast.success(`Factura emitida desde ${note.noteNumber}.`);
      onInvoiced();
      onClose();
    } else {
      setError(res.error || 'No se pudo facturar.');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Facturar ${note.noteNumber}`}>
      <div className="space-y-4 text-xs">
        {error && (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-rose-600 dark:text-rose-400" role="alert">
            {error}
          </div>
        )}
        <div>
          <label htmlFor="inv-terms" className="block font-semibold text-foreground mb-1">Condición de Venta</label>
          <select
            id="inv-terms"
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value as 'cash' | 'credit')}
            className="w-full h-9 rounded-md border border-border bg-card px-2"
          >
            <option value="cash">Contado (cobra ahora)</option>
            <option value="credit">Crédito (queda en cartera)</option>
          </select>
        </div>
        {paymentTerms === 'cash' && (
          <>
            <div>
              <label htmlFor="inv-method" className="block font-semibold text-foreground mb-1">Método de Pago</label>
              <select
                id="inv-method"
                value={cashMethod}
                onChange={(e) => setCashMethod(e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-card px-2"
              >
                {CASH_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="inv-register" className="block font-semibold text-foreground mb-1">
                Caja Registradora (opcional — turno abierto)
              </label>
              <select
                id="inv-register"
                value={cashRegisterId ?? ''}
                onChange={(e) => setCashRegisterId(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full h-9 rounded-md border border-border bg-card px-2"
              >
                <option value="">Sin caja</option>
                {openRegisters.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          </>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <ButtonGhost onClose={onClose} />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <FileText className="h-3.5 w-3.5" aria-hidden="true" />}
            Emitir Factura
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ButtonGhost({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="h-9 px-4 rounded-md border border-border text-xs"
    >
      Cancelar
    </button>
  );
}
