'use client';

import React, { useState } from 'react';
import { Modal } from './Modal';
import { createInvoiceAction } from '@/actions/erpActions';
import { formatUSD, formatVES } from '../KpiCard';
import { Plus, Trash2, Loader2 } from 'lucide-react';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: number;
  tenantSlug: string;
  customers: Array<{ id: number; name: string; taxId: string }>;
  products: Array<{ id: number; name: string; sku: string; priceUSD: number; unitOfMeasure: string }>;
  rate: number;
}

export function InvoiceModal({
  isOpen,
  onClose,
  tenantId,
  tenantSlug,
  customers,
  products,
  rate,
}: InvoiceModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState<number>(customers[0]?.id || 0);
  const [paymentTerms, setPaymentTerms] = useState<'cash' | 'credit'>('cash');
  const [notes, setNotes] = useState('');

  const [items, setItems] = useState<Array<{ sku: string; description: string; quantity: number; unitPriceUSD: number }>>([
    {
      sku: products[0]?.sku || '',
      description: products[0]?.name || 'Artículo de Venta',
      quantity: 1,
      unitPriceUSD: products[0]?.priceUSD || 10,
    },
  ]);

  const handleAddItem = () => {
    const defaultProd = products[0];
    setItems([
      ...items,
      {
        sku: defaultProd?.sku || '',
        description: defaultProd?.name || 'Artículo',
        quantity: 1,
        unitPriceUSD: defaultProd?.priceUSD || 0,
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
      sku: prod.sku,
      description: prod.name,
      quantity: newItems[index].quantity,
      unitPriceUSD: prod.priceUSD,
    };
    setItems(newItems);
  };

  const handleItemChange = (index: number, field: 'quantity' | 'unitPriceUSD' | 'description', value: number | string) => {
    const newItems = [...items];
    newItems[index] = {
      ...newItems[index],
      [field]: value,
    };
    setItems(newItems);
  };

  const totalUSD = items.reduce((acc, it) => acc + (Number(it.quantity) || 0) * (Number(it.unitPriceUSD) || 0), 0);
  const totalVES = totalUSD * rate;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) {
      setError('Debes seleccionar un cliente.');
      return;
    }
    if (items.length === 0) {
      setError('Debes agregar al menos un artículo.');
      return;
    }

    setLoading(true);
    setError(null);

    const res = await createInvoiceAction({
      tenantId,
      tenantSlug,
      customerId,
      paymentTerms,
      items,
      notes,
    });

    setLoading(false);

    if (res.success) {
      setNotes('');
      onClose();
    } else {
      setError(res.error || 'Error al emitir factura');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Emitir Venta / Factura Bimonetaria"
      description="Genera una factura de venta con cálculo automático en USD y Bolívares a tasa oficial BCV."
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
              required
              value={customerId}
              onChange={(e) => setCustomerId(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.taxId})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-300 mb-1">Condición Comercial</label>
            <select
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value as 'cash' | 'credit')}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none font-semibold"
            >
              <option value="cash">Contado (Pagada de Inmediato)</option>
              <option value="credit">Crédito Comercial (Genera CxC)</option>
            </select>
          </div>
        </div>

        {/* Líneas de Artículos */}
        <div className="space-y-2 border-t border-slate-800/80 pt-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-300 uppercase tracking-wider text-[10px]">
              Líneas de Detalle / Productos
            </span>
            <button
              type="button"
              onClick={handleAddItem}
              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Agregar Artículo</span>
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
                    value={it.unitPriceUSD}
                    onChange={(e) => handleItemChange(idx, 'unitPriceUSD', Number(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-slate-800 p-1.5 text-xs text-white text-right font-mono text-emerald-400 font-bold"
                    placeholder="Precio $"
                  />
                </div>

                <div className="col-span-2 text-right font-mono font-bold text-white text-xs">
                  {formatUSD(it.quantity * it.unitPriceUSD)}
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

        {/* Resumen de Totales */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2">
          <div className="flex items-center justify-between text-slate-300">
            <span>Tasa BCV Aplicada:</span>
            <span className="font-mono text-xs">{formatVES(rate)} / USD</span>
          </div>

          <div className="flex items-center justify-between text-base font-bold text-white border-t border-slate-800/80 pt-2">
            <span>Total Factura (USD):</span>
            <span className="font-mono text-indigo-400">{formatUSD(totalUSD)}</span>
          </div>

          <div className="flex items-center justify-between text-xs font-semibold text-emerald-400">
            <span>Total Equivalente en Bolívares:</span>
            <span className="font-mono">{formatVES(totalVES)}</span>
          </div>
        </div>

        <div>
          <label className="block font-semibold text-slate-300 mb-1">Notas / Observaciones</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej. Entregar en sede norte con orden de despacho"
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
            <span>Emitir Factura</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
