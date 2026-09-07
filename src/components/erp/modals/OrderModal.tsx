'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useSyncOnKeyChange } from '../hooks/useSyncOnKeyChange';
import { Modal } from './Modal';
import { createOrderAction, updateOrderAction } from '@/actions/erpActions';
import { effectivePriceForTier } from '@/utilities/priceTiers';
import { formatUSD, formatVES } from '../KpiCard';
import { Plus, Trash2, Loader2 } from 'lucide-react';

interface OrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: number;
  tenantSlug: string;
  customers: Array<{ id: number; name: string; taxId: string; priceTier?: string | null }>;
  products: Array<{
    id: number;
    name: string;
    sku: string;
    priceUSD: number;
    priceTiers?: Array<{ tier: string; priceUSD: number }> | null;
  }>;
  rate: number;
  /** Si se pasa, el modal opera en modo edición sobre ese pedido (draft). */
  initial?: {
    id: number;
    customerId: number;
    items: Array<{
      productId?: number;
      sku?: string;
      description: string;
      quantity: number;
      unitPriceUSD: number;
      discountPct?: number;
    }>;
    notes?: string | null;
  } | null;
}

interface OrderLine {
  productId?: number;
  sku: string;
  description: string;
  quantity: number;
  unitPriceUSD: number;
  discountPct: number;
}

const blankLine = (products: OrderModalProps['products']): OrderLine => ({
  productId: products[0]?.id,
  sku: products[0]?.sku || '',
  description: products[0]?.name || 'Concepto del Pedido',
  quantity: 1,
  unitPriceUSD: products[0]?.priceUSD || 0,
  discountPct: 0,
});

export function OrderModal({
  isOpen,
  onClose,
  tenantId,
  tenantSlug,
  customers,
  products,
  rate,
  initial,
}: OrderModalProps) {
  const isEdit = Boolean(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tier del cliente seleccionado con la misma utilidad que InvoiceModal,
  // QuoteModal y POSView: líneas nuevas/seleccionadas parten del precio
  // efectivo del tier (fallback retail).
  const tierFor = (id: number) => customers.find((c) => c.id === id)?.priceTier || 'retail';
  const initialTier = tierFor(initial?.customerId || customers[0]?.id || 0);

  const [customerId, setCustomerId] = useState<number>(initial?.customerId || customers[0]?.id || 0);
  const [notes, setNotes] = useState(initial?.notes || '');

  const customerTier = tierFor(customerId);
  const priceFor = (product: {
    priceUSD?: number | null;
    priceTiers?: Array<{ tier: string; priceUSD?: number | null }> | null;
  }) => effectivePriceForTier(product, customerTier);

  // Tier vigente en el último render/carga: distingue líneas auto-precidas de
  // las editadas manualmente al cambiar de cliente.
  const prevTierRef = useRef<string>(initialTier);

  const [items, setItems] = useState<OrderLine[]>(
    initial?.items?.length
      ? initial.items.map((it) => ({
          productId: it.productId,
          sku: it.sku || '',
          description: it.description,
          quantity: it.quantity,
          unitPriceUSD: it.unitPriceUSD,
          discountPct: it.discountPct || 0,
        }))
      : [{ ...blankLine(products), unitPriceUSD: products[0] ? effectivePriceForTier(products[0], initialTier) : 0 }],
  );

  // Sincroniza SIEMPRE los campos con `initial`: al montar, al abrir y cuando
  // cambia el pedido seleccionado. Con initial null (modo creación) restaura
  // los defaults para que un "Nuevo" no herede valores de una edición previa.
  // Ajuste de estado en render (patrón oficial de React) en lugar de useEffect.
  useSyncOnKeyChange(`${isOpen}:${initial?.id ?? 'new'}`, () => {
    if (initial) {
      setCustomerId(initial.customerId || customers[0]?.id || 0);
      setNotes(initial.notes || '');
      setItems(
        initial.items?.length
          ? initial.items.map((it) => ({
              productId: it.productId,
              sku: it.sku || '',
              description: it.description,
              quantity: it.quantity,
              unitPriceUSD: it.unitPriceUSD,
              discountPct: it.discountPct || 0,
            }))
          : [blankLine(products)],
      );
    } else {
      setCustomerId(customers[0]?.id || 0);
      setNotes('');
      setItems([blankLine(products)]);
    }
    prevTierRef.current = tierFor(initial?.customerId || customers[0]?.id || 0);
  });

  // Cambio de cliente: sólo se re-precian las líneas auto-gestionadas (precio
  // igual al efectivo del tier anterior); las editadas manualmente se conservan.
  useEffect(() => {
    const prevTier = prevTierRef.current;
    if (prevTier === customerTier) return;
    prevTierRef.current = customerTier;
    setItems((current) =>
      current.map((line) => {
        if (!line.productId) return line;
        const prod = products.find((p) => p.id === line.productId);
        if (!prod) return line;
        const prevPrice = effectivePriceForTier(prod, prevTier);
        const nextPrice = effectivePriceForTier(prod, customerTier);
        if (Math.abs(line.unitPriceUSD - prevPrice) < 0.005 && Math.abs(nextPrice - prevPrice) > 0.005) {
          return { ...line, unitPriceUSD: nextPrice };
        }
        return line;
      }),
    );
  }, [customerId, customerTier, products]);

  const handleAddItem = () => {
    const prod = products[0];
    setItems([
      ...items,
      {
        ...blankLine(products),
        unitPriceUSD: prod ? priceFor(prod) : 0,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSelectProduct = (index: number, sku: string) => {
    const prod = products.find((p) => p.sku === sku);
    if (!prod) return;
    const newItems = [...items];
    newItems[index] = {
      ...newItems[index],
      productId: prod.id,
      sku: prod.sku,
      description: prod.name,
      unitPriceUSD: priceFor(prod),
    };
    setItems(newItems);
  };

  const handleItemChange = (
    index: number,
    field: 'quantity' | 'unitPriceUSD' | 'description' | 'discountPct',
    value: number | string,
  ) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const lineTotal = (line: OrderLine) =>
    line.quantity * line.unitPriceUSD * (1 - Math.min(Math.max(line.discountPct || 0, 0), 100) / 100);
  const totalUSD = items.reduce((acc, it) => acc + lineTotal(it), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) {
      setError('Debes seleccionar un cliente.');
      return;
    }

    setLoading(true);
    setError(null);

    const res = isEdit
      ? await updateOrderAction({
          tenantId,
          tenantSlug,
          orderId: initial!.id,
          customerId,
          items,
          // Edición: vaciar el campo envía null (limpia); no undefined.
          notes: notes.trim() === '' ? null : notes,
        })
      : await createOrderAction({
          tenantId,
          tenantSlug,
          customerId,
          items,
          notes: notes || undefined,
        });

    setLoading(false);

    if (res.success) {
      if (!isEdit) {
        setNotes('');
        setItems([blankLine(products)]);
      }
      onClose();
    } else {
      setError(res.error || 'Error al guardar el pedido');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? `Editar Pedido — ${initial!.id}` : 'Nuevo Pedido de Venta'}
      description="Pedido pendiente de despacho: al confirmarlo queda listo para facturar. El inventario se descarga solo al facturar."
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
            <label className="block font-semibold text-slate-300 mb-1">Cliente *</label>
            <select
              value={customerId || ''}
              onChange={(e) => setCustomerId(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.taxId}){c.priceTier && c.priceTier !== 'retail' ? ` · ${c.priceTier}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <div className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 flex items-center justify-between">
              <span className="text-slate-400">Tasa aplicada:</span>
              <span className="font-mono text-slate-200">{formatUSD(rate)} / USD</span>
            </div>
          </div>
        </div>

        {/* Líneas */}
        <div className="space-y-2 border-t border-slate-800/80 pt-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-300 uppercase tracking-wider text-[10px]">
              Líneas del Pedido
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

          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {items.map((it, idx) => (
              <div
                key={idx}
                className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg bg-slate-950/50 border border-slate-800"
              >
                <div className="col-span-4">
                  <select
                    value={it.sku}
                    onChange={(e) => handleSelectProduct(idx, e.target.value)}
                    className="w-full rounded border border-slate-700 bg-slate-800 p-1.5 text-xs text-white"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.sku}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={it.description}
                    onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                    placeholder="Descripción de la línea"
                    className="w-full mt-1 rounded border border-slate-700 bg-slate-900 p-1.5 text-[11px] text-white"
                  />
                </div>

                <div className="col-span-2">
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={it.quantity}
                    onChange={(e) => handleItemChange(idx, 'quantity', Number(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-slate-800 p-1.5 text-xs text-white text-right font-mono"
                    placeholder="Cant."
                  />
                </div>

                <div className="col-span-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={it.unitPriceUSD}
                    onChange={(e) => handleItemChange(idx, 'unitPriceUSD', Number(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-slate-800 p-1.5 text-xs text-white text-right font-mono text-amber-400 font-bold"
                    placeholder="Precio $"
                  />
                </div>

                <div className="col-span-1">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={it.discountPct}
                    onChange={(e) => handleItemChange(idx, 'discountPct', Number(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-slate-800 p-1.5 text-xs text-white text-right font-mono"
                    placeholder="%"
                    title="Descuento %"
                  />
                </div>

                <div className="col-span-2 text-right font-mono font-bold text-white text-xs">
                  {formatUSD(lineTotal(it))}
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

        {/* Totales */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2">
          <div className="flex items-center justify-between text-base font-bold text-white border-t border-slate-800/80 pt-2">
            <span>Total Pedido (USD):</span>
            <span className="font-mono text-amber-400">{formatUSD(totalUSD)}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Equivalente (VES):</span>
            <span className="font-mono">{formatVES(totalUSD * rate)}</span>
          </div>
        </div>

        <div>
          <label className="block font-semibold text-slate-300 mb-1">Notas / Instrucciones de Entrega</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej. Entregar en almacén del cliente, contacto de recepción..."
            rows={2}
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
            <span>{isEdit ? 'Guardar Cambios' : 'Crear Pedido'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
