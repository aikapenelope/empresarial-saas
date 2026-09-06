'use client';

import React, { useState } from 'react';
import { Modal } from './Modal';
import { createSaleReturnAction } from '@/actions/erpActions';
import { Loader2, Undo2 } from 'lucide-react';

interface ReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: number;
  tenantSlug: string;
  invoice: {
    id: number;
    invoiceNumber: string;
    items: Array<{ productId?: number; description: string; quantity: number }>;
  };
}

export function ReturnModal({ isOpen, onClose, tenantId, tenantSlug, invoice }: ReturnModalProps) {
  const returnableItems = invoice.items.filter(
    (it) => typeof it.productId === 'number' && it.productId > 0,
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [reason, setReason] = useState('');

  const lines = returnableItems
    .map((it) => ({
      productId: it.productId as number,
      quantity: Number(quantities[it.productId as number]) || 0,
      description: it.description,
      soldQty: it.quantity,
    }))
    .filter((l) => l.quantity > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lines.length === 0) {
      setError('Indica la cantidad a devolver de al menos un producto.');
      return;
    }

    setLoading(true);
    setError(null);

    const res = await createSaleReturnAction({
      tenantId,
      tenantSlug,
      invoiceId: invoice.id,
      lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      reason: reason || undefined,
    });

    setLoading(false);

    if (res.success) {
      onClose();
    } else {
      setError(res.error || 'Error al registrar la devolución');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Registrar Devolución — ${invoice.invoiceNumber}`}
      description="Las unidades reingresan al MISMO almacén de donde salieron (Kardex FIFO). No pueden devolverse más unidades de las vendidas y aún no devueltas."
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-rose-300">
            {error}
          </div>
        )}

        {returnableItems.length === 0 ? (
          <p className="text-slate-400 text-center py-6">
            Esta factura no tiene líneas con productos de catálogo: no hay inventario que devolver.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-slate-300 font-semibold uppercase text-[10px] tracking-wider">
              <Undo2 className="h-3.5 w-3.5 text-amber-400" />
              <span>Cantidades a Devolver</span>
            </div>

            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                  <th className="py-1.5">Producto</th>
                  <th className="py-1.5 text-right">Vendido</th>
                  <th className="py-1.5 text-right">A Devolver</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {returnableItems.map((it) => {
                  const pid = it.productId as number;
                  return (
                    <tr key={pid}>
                      <td className="py-1.5 text-white">{it.description}</td>
                      <td className="py-1.5 text-right font-mono text-slate-300">{it.quantity}</td>
                      <td className="py-1.5 text-right">
                        <input
                          type="number"
                          min="0"
                          max={it.quantity}
                          step="1"
                          value={quantities[pid] ?? 0}
                          onChange={(e) =>
                            setQuantities((prev) => ({
                              ...prev,
                              [pid]: Math.min(Number(e.target.value) || 0, it.quantity),
                            }))
                          }
                          className="w-20 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-right font-mono text-white"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {returnableItems.length > 0 && (
          <div>
            <label className="block font-semibold text-slate-300 mb-1">
              Motivo de la Devolución
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. Producto defectuoso, devuelto sin abrir"
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        )}

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
            disabled={loading || returnableItems.length === 0}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold transition-all disabled:opacity-50"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>Registrar Devolución</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
