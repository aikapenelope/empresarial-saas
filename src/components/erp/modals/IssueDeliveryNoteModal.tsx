'use client';

import React, { useState } from 'react';
import { Modal } from './Modal';
import { issueDeliveryNoteAction } from '@/actions/erpActions';
import { Loader2, Truck } from 'lucide-react';

export interface DeliverableLine {
  index: number;
  description: string;
  sku?: string | null;
  ordered: number;
  dispatched: number;
}

interface IssueDeliveryNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: number;
  tenantSlug: string;
  order: {
    id: number;
    orderNumber: string;
  };
  lines: DeliverableLine[];
}

/**
 * Emite una remisión (total o parcial) desde un pedido confirmado: cada línea
 * parte con la cantidad pendiente de despacho y puede ajustarse hacia abajo.
 */
export function IssueDeliveryNoteModal({
  isOpen,
  onClose,
  tenantId,
  tenantSlug,
  order,
  lines,
}: IssueDeliveryNoteModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<number, string>>(() =>
    Object.fromEntries(lines.map((l) => [l.index, String(Math.max(l.ordered - l.dispatched, 0))])),
  );
  const [notes, setNotes] = useState('');

  const selected = lines
    .map((l) => ({ orderItemIndex: l.index, quantity: Number(quantities[l.index]) || 0 }))
    .filter((l) => l.quantity > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selected.length === 0) {
      setError('Ingresa al menos una cantidad a despachar.');
      return;
    }

    setLoading(true);
    setError(null);

    const res = await issueDeliveryNoteAction({
      tenantId,
      tenantSlug,
      orderId: order.id,
      items: selected,
      notes: notes || undefined,
    });

    setLoading(false);

    if (res.success) {
      onClose();
    } else {
      setError(res.error || 'Error al emitir la remisión');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Emitir Remisión — ${order.orderNumber}`}
      description="Documento de entrega sin efecto en inventario: el stock se descarga al facturar. Ajusta las cantidades para despachos parciales."
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-rose-300">
            {error}
          </div>
        )}

        <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3 flex items-center gap-2 text-slate-300">
          <Truck className="h-4 w-4 text-indigo-400" />
          <span>{order.orderNumber}</span>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          <div className="grid grid-cols-12 gap-2 text-[10px] uppercase font-semibold text-slate-400 px-2">
            <span className="col-span-6">Línea</span>
            <span className="col-span-2 text-right">Pedida</span>
            <span className="col-span-2 text-right">Despachada</span>
            <span className="col-span-2 text-right">A Despachar</span>
          </div>
          {lines.map((l) => {
            const remaining = Math.max(l.ordered - l.dispatched, 0);
            return (
              <div
                key={l.index}
                className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg bg-slate-950/50 border border-slate-800"
              >
                <div className="col-span-6">
                  <p className="text-white font-semibold">{l.description}</p>
                  {l.sku && <p className="font-mono text-[10px] text-slate-500">{l.sku}</p>}
                </div>
                <div className="col-span-2 text-right font-mono text-slate-300">{l.ordered}</div>
                <div className="col-span-2 text-right font-mono text-slate-400">{l.dispatched}</div>
                <div className="col-span-2">
                  <input
                    type="number"
                    min="0"
                    max={remaining}
                    step="0.001"
                    value={quantities[l.index] ?? '0'}
                    onChange={(e) =>
                      setQuantities((q) => ({ ...q, [l.index]: e.target.value }))
                    }
                    disabled={remaining <= 0}
                    className="w-full rounded border border-slate-700 bg-slate-800 p-1.5 text-xs text-white text-right font-mono disabled:opacity-40"
                    placeholder="0"
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div>
          <label className="block font-semibold text-slate-300 mb-1">Notas de Entrega</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej. Entregado a chofer, guía #123"
            className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white placeholder-slate-500"
          />
        </div>

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
            disabled={loading || selected.length === 0}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all disabled:opacity-50"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>Emitir Remisión</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
