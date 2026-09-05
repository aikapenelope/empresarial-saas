'use client';

import React, { useState } from 'react';
import { Modal } from './Modal';
import { createProductAction } from '@/actions/erpActions';
import { Loader2 } from 'lucide-react';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: number;
  tenantSlug: string;
}

export function ProductModal({ isOpen, onClose, tenantId, tenantSlug }: ProductModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [productType, setProductType] = useState<'standard' | 'raw_material' | 'manufactured' | 'service'>('standard');
  const [unitOfMeasure, setUnitOfMeasure] = useState<'unit' | 'kg' | 'g' | 'l' | 'ml' | 'm' | 'box'>('unit');
  const [costUSD, setCostUSD] = useState(0);
  const [priceUSD, setPriceUSD] = useState(0);
  const [minStockAlert, setMinStockAlert] = useState(10);
  const [currentStock, setCurrentStock] = useState(0);

  const handleGenerateSku = () => {
    const prefix = productType === 'raw_material' ? 'MP' : productType === 'manufactured' ? 'PT' : 'ART';
    const rand = Math.floor(1000 + Math.random() * 9000);
    setSku(`${prefix}-${rand}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await createProductAction({
      tenantId,
      tenantSlug,
      name,
      sku: sku || `SKU-${Date.now().toString().slice(-5)}`,
      productType,
      unitOfMeasure,
      costUSD,
      priceUSD,
      minStockAlert,
      currentStock,
    });

    setLoading(false);

    if (res.success) {
      setName('');
      setSku('');
      setCostUSD(0);
      setPriceUSD(0);
      setCurrentStock(0);
      onClose();
    } else {
      setError(res.error || 'Error al guardar producto');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Nuevo Artículo / Insumo"
      description="Registra un nuevo producto para ventas directas o materia prima para fórmulas de fabricación BOM."
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-rose-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-300 mb-1">Nombre del Artículo *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Harina de Trigo Panadera"
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-slate-300">SKU / Código *</label>
              <button
                type="button"
                onClick={handleGenerateSku}
                className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold"
              >
                Auto-generar
              </button>
            </div>
            <input
              type="text"
              required
              value={sku}
              onChange={(e) => setSku(e.target.value.toUpperCase())}
              placeholder="Ej. MP-HAR-01"
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-300 mb-1">Tipo de Producto</label>
            <select
              value={productType}
              onChange={(e) => setProductType(e.target.value as 'standard')}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="standard">Estándar (Compra / Venta directa)</option>
              <option value="raw_material">Materia Prima / Insumo BOM</option>
              <option value="manufactured">Manufacturado (Con Receta BOM)</option>
              <option value="service">Servicio</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-300 mb-1">Unidad de Medida</label>
            <select
              value={unitOfMeasure}
              onChange={(e) => setUnitOfMeasure(e.target.value as 'unit')}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="unit">Unidad (ud)</option>
              <option value="kg">Kilogramo (kg)</option>
              <option value="g">Gramo (g)</option>
              <option value="l">Litro (l)</option>
              <option value="box">Caja / Bulto (box)</option>
              <option value="m">Metro (m)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-300 mb-1">Costo Unitario Base (USD)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={costUSD}
              onChange={(e) => setCostUSD(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white font-mono"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-300 mb-1">Precio de Venta al Público (USD)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={priceUSD}
              onChange={(e) => setPriceUSD(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white font-mono font-bold text-emerald-400"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl border border-slate-800 bg-slate-950/60">
          <div>
            <label className="block font-semibold text-slate-300 mb-1">Stock Inicial Actual</label>
            <input
              type="number"
              min="0"
              value={currentStock}
              onChange={(e) => setCurrentStock(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white font-mono"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-300 mb-1">Alerta de Stock Mínimo</label>
            <input
              type="number"
              min="0"
              value={minStockAlert}
              onChange={(e) => setMinStockAlert(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white font-mono"
            />
          </div>
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
            <span>Guardar Artículo</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
