'use client';

import React, { useState, useTransition } from 'react';
import { Modal } from './Modal';
import { adjustStockAction, transferStockAction } from '@/actions/erpActions';
import { Loader2 } from 'lucide-react';

interface StockMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: number;
  tenantSlug: string;
  products: Array<{ id: number; name: string; sku: string }>;
  warehouses: Array<{ id: number; name: string; code: string; isDefault?: boolean | null }>;
}

type MovementKind = 'entrada' | 'salida' | 'transferencia';

export function StockMovementModal({
  isOpen,
  onClose,
  tenantId,
  tenantSlug,
  products,
  warehouses,
}: StockMovementModalProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<MovementKind>('entrada');
  const [productId, setProductId] = useState<number>(products[0]?.id || 0);
  const [sourceWarehouseId, setSourceWarehouseId] = useState<number | undefined>(
    warehouses.find((w) => w.isDefault)?.id ?? warehouses[0]?.id,
  );
  const [targetWarehouseId, setTargetWarehouseId] = useState<number | undefined>(undefined);
  const [quantity, setQuantity] = useState<number>(1);
  const [reason, setReason] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!productId) {
      setError('Selecciona un producto.');
      return;
    }
    if (quantity <= 0) {
      setError('La cantidad debe ser mayor a 0.');
      return;
    }
    if (kind === 'entrada' && !targetWarehouseId) {
      setError('Selecciona el almacén de entrada.');
      return;
    }
    if (kind === 'salida' && !sourceWarehouseId) {
      setError('Selecciona el almacén de salida.');
      return;
    }
    if (kind === 'transferencia' && (!sourceWarehouseId || !targetWarehouseId)) {
      setError('Selecciona almacén de origen y destino.');
      return;
    }
    if (kind === 'transferencia' && sourceWarehouseId === targetWarehouseId) {
      setError('El almacén origen y destino deben ser distintos.');
      return;
    }

    startTransition(async () => {
      if (kind === 'transferencia') {
        const res = await transferStockAction({
          tenantId,
          tenantSlug,
          productId,
          sourceWarehouseId: sourceWarehouseId as number,
          targetWarehouseId: targetWarehouseId as number,
          quantity,
          reason: reason || undefined,
        });
        if (!res.success) {
          setError(res.error || 'Error al transferir.');
          return;
        }
      } else {
        const res = await adjustStockAction({
          tenantId,
          tenantSlug,
          productId,
          warehouseId: (kind === 'entrada' ? targetWarehouseId : sourceWarehouseId) as number,
          direction: kind === 'entrada' ? 'in' : 'out',
          quantity,
          reason: reason || 'Ajuste manual',
        });
        if (!res.success) {
          setError(res.error || 'Error al registrar el ajuste.');
          return;
        }
      }
      onClose();
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Movimiento Manual de Inventario"
      description="Entradas, salidas y transferencias con motivo obligatorio. Todo queda registrado en el Kardex inmutable."
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-destructive">
            {error}
          </div>
        )}

        <div>
          <label className="block font-semibold text-foreground mb-1">Tipo de Movimiento *</label>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { value: 'entrada', label: 'Entrada (+)' },
                { value: 'salida', label: 'Salida (−)' },
                { value: 'transferencia', label: 'Transferencia' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setKind(opt.value)}
                className={`px-2 py-1.5 rounded-lg font-medium transition-colors ${
                  kind === opt.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground border border-border'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block font-semibold text-foreground mb-1">Producto *</label>
          <select
            value={productId}
            onChange={(e) => setProductId(Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground focus:border-ring focus:outline-none"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.sku})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {kind === 'transferencia' && (
            <div>
              <label className="block font-semibold text-foreground mb-1">Origen *</label>
              <select
                value={sourceWarehouseId ?? ''}
                onChange={(e) => setSourceWarehouseId(Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground focus:border-ring focus:outline-none"
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {kind === 'salida' && (
            <div>
              <label className="block font-semibold text-foreground mb-1">Almacén de Salida *</label>
              <select
                value={sourceWarehouseId ?? ''}
                onChange={(e) => setSourceWarehouseId(Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground focus:border-ring focus:outline-none"
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {kind !== 'salida' && (
            <div>
              <label className="block font-semibold text-foreground mb-1">
                {kind === 'transferencia' ? 'Destino *' : 'Almacén de Entrada *'}
              </label>
              <select
                value={targetWarehouseId ?? ''}
                onChange={(e) => setTargetWarehouseId(Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground focus:border-ring focus:outline-none"
              >
                <option value="">-- Selecciona --</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block font-semibold text-foreground mb-1">Cantidad *</label>
            <input
              type="number"
              min="0.001"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground text-right font-mono focus:border-ring focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block font-semibold text-foreground mb-1">Motivo *</label>
          <input
            type="text"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej. Producto dañado detectado en estante 3"
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
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-all disabled:opacity-50"
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>Registrar Movimiento</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
