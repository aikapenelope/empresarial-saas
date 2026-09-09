'use client';

import React, { useState } from 'react';
import { useSyncOnKeyChange } from '../hooks/useSyncOnKeyChange';
import { Modal } from './Modal';
import { executeProductionOrderAction } from '@/actions/erpActions';
import { Loader2, FlaskConical } from 'lucide-react';

interface BomItem {
  rawMaterial: number | { id?: number; name: string; unitOfMeasure?: string };
  quantity: number;
}

interface Bom {
  id: number;
  name: string;
  outputQuantity: number;
  product: number | { id: number; name: string };
  items?: BomItem[];
}

interface ProductionModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: number;
  tenantSlug: string;
  boms: Bom[];
  warehouses: Array<{ id: number; name: string; code: string }>;
  defaultBomId?: number;
}

export function ProductionModal({
  isOpen,
  onClose,
  tenantId,
  tenantSlug,
  boms,
  warehouses,
  defaultBomId,
}: ProductionModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bomId, setBomId] = useState<number>(defaultBomId || boms[0]?.id || 0);
  const [unitsToProduce, setUnitsToProduce] = useState<number>(10);
  const [sourceWarehouseId, setSourceWarehouseId] = useState<number>(warehouses[0]?.id || 1);
  const [targetWarehouseId, setTargetWarehouseId] = useState<number>(warehouses[0]?.id || 1);

  // Fija el BOM pedido cuando cambia el default (ajuste de estado en render,
  // patrón oficial de React, en lugar de useEffect).
  useSyncOnKeyChange(defaultBomId ?? 0, () => {
    if (defaultBomId) {
      setBomId(defaultBomId);
    }
  });

  const selectedBom = boms.find((b) => b.id === bomId);
  const productName =
    typeof selectedBom?.product === 'object' && selectedBom.product !== null
      ? (selectedBom.product as { name: string }).name
      : 'Producto Terminado';

  const multiplier = selectedBom?.outputQuantity ? unitsToProduce / selectedBom.outputQuantity : 1;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bomId) {
      setError('Debes seleccionar una receta BOM.');
      return;
    }
    if (unitsToProduce <= 0) {
      setError('Las unidades a producir deben ser mayores a 0.');
      return;
    }

    setLoading(true);
    setError(null);

    const res = await executeProductionOrderAction({
      tenantId,
      tenantSlug,
      bomId,
      unitsToProduce,
      sourceWarehouseId,
      targetWarehouseId,
    });

    setLoading(false);

    if (res.success) {
      setUnitsToProduce(10);
      onClose();
    } else {
      setError(res.error || 'Error al ejecutar orden de fabricación');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Fabricar Lote de Producción (BOM)"
      description="Ejecuta una orden de fabricación atómica: descuenta materias primas del almacén origen y acredita productos terminados en el almacén destino."
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-rose-300">
            {error}
          </div>
        )}

        {/* Receta */}
        <div>
          <label className="block font-semibold text-foreground mb-1">Receta / Fórmula BOM *</label>
          <select
            value={bomId}
            onChange={(e) => setBomId(Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground focus:border-ring focus:outline-none"
          >
            {boms.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} (Base rinde: {b.outputQuantity} unid.)
              </option>
            ))}
          </select>
        </div>

        {/* Cantidad a fabricar */}
        <div>
          <label className="block font-semibold text-foreground mb-1">
            Unidades a Fabricar de {productName} *
          </label>
          <input
            type="number"
            min="1"
            required
            value={unitsToProduce}
            onChange={(e) => setUnitsToProduce(Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground font-mono focus:border-ring focus:outline-none"
          />
        </div>

        {/* Almacenes Origen y Destino */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-foreground mb-1">
              Almacén Origen (Consumo de Insumos) *
            </label>
            <select
              value={sourceWarehouseId}
              onChange={(e) => setSourceWarehouseId(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground focus:border-ring focus:outline-none"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-foreground mb-1">
              Almacén Destino (Recepción Prod. Terminado) *
            </label>
            <select
              value={targetWarehouseId}
              onChange={(e) => setTargetWarehouseId(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground focus:border-ring focus:outline-none"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Desglose de Insumos a Descontar */}
        {selectedBom?.items && selectedBom.items.length > 0 && (
          <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-foreground font-semibold uppercase text-[10px] tracking-wider">
              <FlaskConical className="h-3.5 w-3.5 text-indigo-400" />
              <span>Insumos calculados a descontar del almacén origen:</span>
            </div>

            <ul className="divide-y divide-border">
              {selectedBom.items.map((item, idx) => {
                const rawName =
                  typeof item.rawMaterial === 'object' && item.rawMaterial !== null
                    ? (item.rawMaterial as { name: string }).name
                    : 'Insumo';
                const uom =
                  typeof item.rawMaterial === 'object' && item.rawMaterial !== null
                    ? (item.rawMaterial as { unitOfMeasure?: string }).unitOfMeasure || ''
                    : '';
                const totalReq = (item.quantity * multiplier).toFixed(2);

                return (
                  <li key={idx} className="py-1 flex items-center justify-between text-muted-foreground">
                    <span>{rawName}</span>
                    <span className="font-mono text-foreground font-medium">
                      {totalReq} {uom}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

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
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-foreground font-semibold transition-all disabled:opacity-50"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>Ejecutar Fabricación</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
