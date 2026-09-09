'use client';

import React, { useState } from 'react';
import { Modal } from './Modal';
import { Loader2, PackageCheck } from 'lucide-react';

interface ReceiveWarehouseModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceNumber: string;
  warehouses: Array<{ id: number; name: string; code: string }>;
  onConfirm: (warehouseId: number) => Promise<void>;
}

/**
 * Selección de almacén al momento de recepcionar una compra diferida
 * (creada sin "Recibir ahora"). Devin #25 hallazgo 1.
 */
export function ReceiveWarehouseModal({
  isOpen,
  onClose,
  invoiceNumber,
  warehouses,
  onConfirm,
}: ReceiveWarehouseModalProps) {
  const [loading, setLoading] = useState(false);
  const [warehouseId, setWarehouseId] = useState<number | undefined>(warehouses[0]?.id);

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!warehouseId) return;
    setLoading(true);
    await onConfirm(warehouseId);
    setLoading(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Recepcionar ${invoiceNumber}`}
      description="Elige el almacén donde ingresará la mercancía. Se generará un movimiento purchase_in por cada línea y se actualizará el costo ponderado."
      maxWidth="md"
    >
      <form onSubmit={handleConfirm} className="space-y-4 text-xs">
        <div>
          <label className="block font-semibold text-foreground mb-1">Almacén de Recepción *</label>
          <select
            value={warehouseId ?? ''}
            onChange={(e) => setWarehouseId(Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground focus:border-ring focus:outline-none"
          >
            <option value="">-- Selecciona --</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.code})
              </option>
            ))}
          </select>
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
            disabled={loading || !warehouseId}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-foreground font-semibold transition-all disabled:opacity-50"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <PackageCheck className="h-3.5 w-3.5" />
            <span>Recepcionar</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
