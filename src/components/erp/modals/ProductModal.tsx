'use client';

import React, { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { toast } from 'sonner';
import { createProductAction, updateProductAction } from '@/actions/erpActions';
import { Loader2, Plus, Trash2 } from 'lucide-react';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: number;
  tenantSlug: string;
  /** Si se pasa, el modal opera en modo edición sobre ese producto. */
  initial?: {
    id: number;
    name: string;
    sku: string;
    productType?: string | null;
    unitOfMeasure?: string | null;
    costUSD?: number | null;
    priceUSD?: number | null;
    taxRate?: string | null;
    minStockAlert?: number | null;
    priceTiers?: Array<{ tier: string; priceUSD: number }> | null;
  } | null;
}

const TIER_OPTIONS = ['wholesale', 'vendor', 'promo'] as const;

export function ProductModal({ isOpen, onClose, tenantId, tenantSlug, initial }: ProductModalProps) {
  const isEdit = Boolean(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initial?.name || '');
  const [sku, setSku] = useState(initial?.sku || '');
  const [productType, setProductType] = useState<'standard' | 'raw_material' | 'manufactured' | 'service'>(
    (initial?.productType as 'standard') || 'standard',
  );
  const [unitOfMeasure, setUnitOfMeasure] = useState<'unit' | 'kg' | 'g' | 'l' | 'ml' | 'm' | 'box'>(
    (initial?.unitOfMeasure as 'unit') || 'unit',
  );
  const [costUSD, setCostUSD] = useState(Number(initial?.costUSD) || 0);
  const [priceUSD, setPriceUSD] = useState(Number(initial?.priceUSD) || 0);
  const [taxRate, setTaxRate] = useState<'exempt' | 'general' | 'reduced'>(
    (initial?.taxRate as 'general') || 'exempt',
  );
  const [minStockAlert, setMinStockAlert] = useState(Number(initial?.minStockAlert) || 0);
  const [tiers, setTiers] = useState<Array<{ tier: (typeof TIER_OPTIONS)[number]; priceUSD: number }>>(
    (initial?.priceTiers || []).map((t) => ({
      tier: (t.tier as (typeof TIER_OPTIONS)[number]) || 'wholesale',
      priceUSD: Number(t.priceUSD) || 0,
    })),
  );

  // Sincroniza SIEMPRE los campos con `initial`: al montar, al abrir y cuando
  // cambia el registro seleccionado. Con initial null (modo creación) restaura
  // los defaults para que un "Nuevo" no herede valores de una edición previa.
  useEffect(() => {
    if (initial) {
      setName(initial.name || '');
      setSku(initial.sku || '');
      setProductType((initial.productType as 'standard') || 'standard');
      setUnitOfMeasure((initial.unitOfMeasure as 'unit') || 'unit');
      setCostUSD(Number(initial.costUSD) || 0);
      setPriceUSD(Number(initial.priceUSD) || 0);
      setTaxRate((initial.taxRate as 'general') || 'exempt');
      setMinStockAlert(Number(initial.minStockAlert) || 0);
      setTiers(
        (initial.priceTiers || []).map((t) => ({
          tier: (t.tier as (typeof TIER_OPTIONS)[number]) || 'wholesale',
          priceUSD: Number(t.priceUSD) || 0,
        })),
      );
    } else {
      setName('');
      setSku('');
      setProductType('standard');
      setUnitOfMeasure('unit');
      setCostUSD(0);
      setPriceUSD(0);
      setTaxRate('exempt');
      setMinStockAlert(0);
      setTiers([]);
    }
  }, [initial, isOpen]);

  const handleGenerateSku = () => {
    const prefix = productType === 'raw_material' ? 'MP' : productType === 'manufactured' ? 'PT' : 'ART';
    const rand = Math.floor(1000 + Math.random() * 9000);
    setSku(`${prefix}-${rand}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = isEdit
      ? await updateProductAction({
          tenantId,
          tenantSlug,
          productId: initial!.id,
          name,
          sku,
          productType,
          unitOfMeasure,
          costUSD,
          priceUSD,
          taxRate,
          minStockAlert,
          priceTiers: tiers,
        })
      : await createProductAction({
          tenantId,
          tenantSlug,
          name,
          sku: sku || `SKU-${Date.now().toString().slice(-5)}`,
          productType,
          unitOfMeasure,
          costUSD,
          priceUSD,
          taxRate,
          minStockAlert,
        });

    setLoading(false);

    if (res.success) {
      toast.success(isEdit ? 'Producto actualizado.' : 'Producto registrado.');
      if (!isEdit) {
        setName('');
        setSku('');
        setCostUSD(0);
        setPriceUSD(0);
      }
      onClose();
    } else {
      setError(res.error || 'Error al guardar producto');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? `Editar Producto — ${initial!.name}` : 'Nuevo Artículo / Insumo'}
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

        <div>
          <label className="block font-semibold text-slate-300 mb-1">Tratamiento Fiscal (IVA)</label>
          <select
            value={taxRate}
            onChange={(e) => setTaxRate(e.target.value as 'exempt')}
            className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
          >
            <option value="exempt">Exento</option>
            <option value="general">Alícuota General (16%)</option>
            <option value="reduced">Alícuota Reducida (8%)</option>
          </select>
        </div>

        {/* Tiers de precio alternativos (el retail es el precio base) */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-300 uppercase tracking-wider text-[10px]">
              Precios por Segmento (mayorista / vendedor / promo)
            </span>
            <button
              type="button"
              onClick={() =>
                setTiers([
                  ...tiers,
                  { tier: TIER_OPTIONS.find((t) => !tiers.some((x) => x.tier === t)) || 'wholesale', priceUSD: 0 },
                ])
              }
              disabled={tiers.length >= 3}
              className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-semibold disabled:opacity-40"
            >
              <Plus className="h-3 w-3" />
              <span>Agregar Tier</span>
            </button>
          </div>
          {tiers.map((t, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-5">
                <select
                  value={t.tier}
                  onChange={(e) => {
                    const newTiers = [...tiers];
                    newTiers[idx] = { ...t, tier: e.target.value as (typeof TIER_OPTIONS)[number] };
                    setTiers(newTiers);
                  }}
                  className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-white"
                >
                  {TIER_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-5">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={t.priceUSD}
                  onChange={(e) => {
                    const newTiers = [...tiers];
                    newTiers[idx] = { ...t, priceUSD: Number(e.target.value) };
                    setTiers(newTiers);
                  }}
                  className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-white text-right font-mono"
                  placeholder="Precio USD"
                />
              </div>
              <div className="col-span-2 text-right">
                <button
                  type="button"
                  onClick={() => setTiers(tiers.filter((_, i) => i !== idx))}
                  className="text-slate-500 hover:text-rose-400 p-1"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          {tiers.length === 0 && (
            <p className="text-slate-500 text-[11px]">Sin tiers alternativos: todos los clientes usan el precio base.</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl border border-slate-800 bg-slate-950/60">
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
