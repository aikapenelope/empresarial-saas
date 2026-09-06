'use client';

import React, { useState } from 'react';
import { Modal } from './Modal';
import { createPurchaseInvoiceAction } from '@/actions/erpActions';
import { formatUSD } from '../KpiCard';
import { Plus, Trash2, Loader2 } from 'lucide-react';

interface PurchaseInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: number;
  tenantSlug: string;
  suppliers: Array<{ id: number; name: string; taxId: string }>;
  products: Array<{ id: number; name: string; sku: string; costUSD: number }>;
  warehouses: Array<{ id: number; name: string; code: string; isDefault?: boolean | null }>;
  rate: number;
}

interface PurchaseLine {
  productId: number;
  sku: string;
  description: string;
  quantity: number;
  unitCostUSD: number;
}

export function PurchaseInvoiceModal({
  isOpen,
  onClose,
  tenantId,
  tenantSlug,
  suppliers,
  products,
  warehouses,
  rate,
}: PurchaseInvoiceModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [supplierId, setSupplierId] = useState<number>(suppliers[0]?.id || 0);
  const [dueDate, setDueDate] = useState<string>('');
  const [receptionWarehouseId, setReceptionWarehouseId] = useState<number | undefined>(
    warehouses.find((w) => w.isDefault)?.id,
  );
  const [receiveNow, setReceiveNow] = useState(true);
  const [notes, setNotes] = useState('');

  const [items, setItems] = useState<PurchaseLine[]>([
    {
      productId: products[0]?.id || 0,
      sku: products[0]?.sku || '',
      description: products[0]?.name || 'Mercancía',
      quantity: 1,
      unitCostUSD: products[0]?.costUSD || 0,
    },
  ]);

  const handleAddItem = () => {
    const prod = products[0];
    setItems([
      ...items,
      {
        productId: prod?.id || 0,
        sku: prod?.sku || '',
        description: prod?.name || 'Mercancía',
        quantity: 1,
        unitCostUSD: prod?.costUSD || 0,
      },
    ]);
  };
  // Nota: productId ya es la clave de selección — el valor 0 solo ocurre sin catálogo.

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSelectProduct = (index: number, productId: number) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;
    const newItems = [...items];
    newItems[index] = {
      ...newItems[index],
      productId: prod.id,
      sku: prod.sku,
      description: prod.name,
      unitCostUSD: prod.costUSD,
    };
    setItems(newItems);
  };

  const handleItemChange = (
    index: number,
    field: 'quantity' | 'unitCostUSD' | 'description',
    value: number | string,
  ) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const totalUSD = items.reduce(
    (acc, it) => acc + (Number(it.quantity) || 0) * (Number(it.unitCostUSD) || 0),
    0,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) {
      setError('Debes seleccionar un proveedor.');
      return;
    }
    if (receiveNow && !receptionWarehouseId) {
      setError('Selecciona el almacén de recepción o desmarca "Recibir ahora".');
      return;
    }

    setLoading(true);
    setError(null);

    const res = await createPurchaseInvoiceAction({
      tenantId,
      tenantSlug,
      supplierId,
      items,
      // Mediodía local: evita que UTC midnight muestre el día anterior en offsets negativos
      dueDate: dueDate ? new Date(`${dueDate}T12:00:00`).toISOString() : undefined,
      receptionWarehouseId: receiveNow ? receptionWarehouseId : undefined,
      notes: notes || undefined,
    });

    setLoading(false);

    if (res.success) {
      setNotes('');
      onClose();
    } else {
      setError(res.error || 'Error al registrar la compra');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Registrar Compra a Proveedor"
      description="Factura de compra con recepción de mercancía: al recibirla ingresa al Kardex y actualiza el costo ponderado."
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-rose-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-300 mb-1">Proveedor *</label>
            <select
              required
              value={supplierId}
              onChange={(e) => setSupplierId(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.taxId})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-300 mb-1">Vencimiento</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Líneas */}
        <div className="space-y-2 border-t border-slate-800/80 pt-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-300 uppercase tracking-wider text-[10px]">
              Líneas de Compra
            </span>
            <button
              type="button"
              onClick={handleAddItem}
              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Agregar Línea</span>
            </button>
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {items.map((it, idx) => (
              <div
                key={idx}
                className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg bg-slate-950/50 border border-slate-800"
              >
                <div className="col-span-4">
                  <select
                    value={it.productId ?? ''}
                    onChange={(e) => handleSelectProduct(idx, Number(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-slate-800 p-1.5 text-xs text-white"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <input
                    type="number"
                    min="1"
                    value={it.quantity}
                    onChange={(e) => handleItemChange(idx, 'quantity', Number(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-slate-800 p-1.5 text-xs text-white text-right font-mono"
                    placeholder="Cant."
                  />
                </div>

                <div className="col-span-3">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={it.unitCostUSD}
                    onChange={(e) => handleItemChange(idx, 'unitCostUSD', Number(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-slate-800 p-1.5 text-xs text-white text-right font-mono text-amber-400 font-bold"
                    placeholder="Costo $"
                  />
                </div>

                <div className="col-span-2 text-right font-mono font-bold text-white text-xs">
                  {formatUSD(it.quantity * it.unitCostUSD)}
                </div>

                <div className="col-span-1 text-right">
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(idx)}
                    disabled={items.length <= 1}
                    className="text-slate-500 hover:text-rose-400 disabled:opacity-30 p-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recepción */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-3">
          <label className="flex items-center gap-2 font-semibold text-slate-300">
            <input
              type="checkbox"
              checked={receiveNow}
              onChange={(e) => setReceiveNow(e.target.checked)}
              className="rounded border-slate-600 bg-slate-800"
            />
            <span>Recibir mercancía ahora (ingresa al Kardex y actualiza costo)</span>
          </label>

          {receiveNow && (
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Almacén de Recepción *</label>
              <select
                value={receptionWarehouseId ?? ''}
                onChange={(e) =>
                  setReceptionWarehouseId(e.target.value ? Number(e.target.value) : undefined)
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="">-- Selecciona --</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code}){w.isDefault ? ' ★' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Totales */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2">
          <div className="flex items-center justify-between text-slate-300">
            <span>Tasa Aplicada:</span>
            <span className="font-mono text-xs">{formatUSD(rate)} / USD</span>
          </div>
          <div className="flex items-center justify-between text-base font-bold text-white border-t border-slate-800/80 pt-2">
            <span>Total Compra (USD):</span>
            <span className="font-mono text-amber-400">{formatUSD(totalUSD)}</span>
          </div>
        </div>

        <div>
          <label className="block font-semibold text-slate-300 mb-1">Notas</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej. Orden de compra #123, flete incluido"
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
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all disabled:opacity-50"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>Registrar Compra</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
