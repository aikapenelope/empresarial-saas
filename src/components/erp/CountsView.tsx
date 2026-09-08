'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ClipboardList,
  Loader2,
  CheckCircle2,
  Save,
  AlertTriangle,
} from 'lucide-react';
import {
  completeInventoryCountAction,
  createInventoryCountAction,
  saveCountedItemsAction,
} from '@/actions/erpActions';
import { Badge } from './Badge';
import { formatUSD } from './format';
import type { InventoryCount } from '@/payload-types';

interface CountsViewProps {
  tenantId: number;
  tenantSlug: string;
  counts: InventoryCount[];
  warehouses: Array<{ id: number; name: string; code: string }>;
}

export function CountsView({ tenantId, tenantSlug, counts, warehouses }: CountsViewProps) {
  const [warehouseId, setWarehouseId] = useState<number | undefined>(warehouses[0]?.id);
  const [notes, setNotes] = useState('');
  const [selectedCountId, setSelectedCountId] = useState<number | undefined>(
    counts.find((c) => c.status === 'in_progress')?.id,
  );
  const [countedQty, setCountedQty] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCount = counts.find((c) => c.id === selectedCountId);
  const activeCount = selectedCount?.status === 'in_progress' ? selectedCount : undefined;

  const differences = useMemo(() => {
    if (!selectedCount) return { negative: 0, positive: 0, missing: 0 };
    const items = Array.isArray(selectedCount.items) ? selectedCount.items : [];
    return items.reduce(
      (acc, it) => {
        if (it.countedQty === null || it.countedQty === undefined) {
          acc.missing += 1;
        } else {
          const diff = (Number(it.countedQty) || 0) - (Number(it.systemQty) || 0);
          if (diff < 0) acc.negative += 1;
          if (diff > 0) acc.positive += 1;
        }
        return acc;
      },
      { negative: 0, positive: 0, missing: 0 },
    );
  }, [selectedCount]);

  const handleCreate = async () => {
    if (!warehouseId) {
      setError('Selecciona un almacén.');
      return;
    }
    setLoading(true);
    setError(null);
    const res = await createInventoryCountAction({
      tenantId,
      tenantSlug,
      warehouseId,
      notes: notes || undefined,
    });
    setLoading(false);
    if (res.success) {
      const created = res.data as { id: number };
      setSelectedCountId(created.id);
      setNotes('');
    } else {
      setError(res.error || 'Error al crear el conteo.');
    }
  };

  const handleSave = async () => {
    if (!selectedCount) return;
    setLoading(true);
    setError(null);
    const counted = Object.entries(countedQty)
      .filter(([, qty]) => qty !== undefined)
      .map(([productId, qty]) => ({ productId: Number(productId), countedQty: qty }));

    const res = await saveCountedItemsAction({
      tenantId,
      tenantSlug,
      countId: selectedCount.id,
      counted,
    });
    setLoading(false);
    if (!res.success) {
      setError(res.error || 'Error al guardar el conteo.');
    }
  };

  const handleComplete = async () => {
    if (!selectedCount) return;
    setLoading(true);
    setError(null);
    const res = await completeInventoryCountAction({
      tenantId,
      tenantSlug,
      countId: selectedCount.id,
    });
    setLoading(false);
    if (!res.success) {
      setError(res.error || 'Error al completar el conteo.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/${tenantSlug}/erp/inventory`}
              className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" />
              Inventario
            </Link>
            <span className="text-slate-600">/</span>
            <span className="text-xs font-semibold text-indigo-400">Conteos Cíclicos</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Conteos Cíclicos de Inventario</h1>
          <p className="text-xs text-slate-400 mt-1">
            Crea el conteo (snapshot del sistema) → cuenta el físico → completa: los ajustes entran por el Kardex.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* Paso 1: Crear */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-5 space-y-3 text-xs">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-white">1. Nuevo Conteo</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block font-semibold text-slate-300 mb-1">Almacén a Contar *</label>
            <select
              value={warehouseId ?? ''}
              onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-300 mb-1">Notas</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Corte mensual bodega principal"
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={loading || !warehouseId}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold disabled:opacity-50"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>Crear Conteo</span>
          </button>
        </div>
      </div>

      {/* Paso 2: Contar */}
      {activeCount && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-white">
                2. Conteo #{activeCount.id} en progreso
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="amber" size="sm">
                {differences.negative} faltante(s)
              </Badge>
              <Badge variant="emerald" size="sm">
                {differences.positive} sobrante(s)
              </Badge>
              {differences.missing > 0 && (
                <Badge variant="slate" size="sm">
                  {differences.missing} sin contar
                </Badge>
              )}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                  <th className="py-1.5">Producto</th>
                  <th className="py-1.5 text-right">Sistema</th>
                  <th className="py-1.5 text-right">Contado</th>
                  <th className="py-1.5 text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {(Array.isArray(activeCount.items) ? activeCount.items : []).map((it) => {
                  const productId =
                    typeof it.product === 'object' && it.product !== null ? it.product.id : it.product;
                  const productName =
                    typeof it.product === 'object' && it.product !== null
                      ? it.product.name
                      : `#${it.product}`;
                  const counted = countedQty[productId];
                  const diff =
                    counted !== undefined
                      ? counted - (Number(it.systemQty) || 0)
                      : null;
                  return (
                    <tr key={`${productId}-${it.id}`}>
                      <td className="py-1.5 text-white">{productName}</td>
                      <td className="py-1.5 text-right font-mono text-slate-300">
                        {Number(it.systemQty) || 0}
                      </td>
                      <td className="py-1.5 text-right">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={counted ?? ''}
                          onChange={(e) =>
                            setCountedQty((prev) => ({
                              ...prev,
                              [productId]: Number(e.target.value),
                            }))
                          }
                          className="w-24 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-right font-mono text-white"
                        />
                      </td>
                      <td className="py-1.5 text-right font-mono">
                        {diff === null ? (
                          <span className="text-slate-500">—</span>
                        ) : diff === 0 ? (
                          <span className="text-slate-400">0</span>
                        ) : diff < 0 ? (
                          <span className="text-rose-400">{diff}</span>
                        ) : (
                          <span className="text-emerald-400">+{diff}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={loading || Object.keys(countedQty).length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 font-semibold hover:bg-slate-700 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              <span>Guardar Conteo</span>
            </button>
            <button
              type="button"
              onClick={handleComplete}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Completar & Ajustar Kardex</span>
            </button>
          </div>
        </div>
      )}

      {/* Paso 3: Historial */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden backdrop-blur">
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Historial de Conteos</h2>
          <span className="text-xs text-slate-400">{counts.length} registro(s)</span>
        </div>

        {counts.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-8">No hay conteos registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                  <th className="p-3">Conteo</th>
                  <th className="p-3">Almacén</th>
                  <th className="p-3">Creado</th>
                  <th className="p-3 text-right">Líneas</th>
                  <th className="p-3 text-right">Costo Ajustes (USD)</th>
                  <th className="p-3 text-center">Estado</th>
                  <th className="p-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {counts.map((c) => {
                  const whName =
                    typeof c.warehouse === 'object' && c.warehouse !== null
                      ? (c.warehouse as { name: string }).name
                      : '—';
                  const adjustmentsCost = (Array.isArray(c.items) ? c.items : []).reduce(
                    (acc, it) =>
                      acc +
                      Math.abs(
                        ((Number(it.difference) || 0) *
                          (typeof it.product === 'object' && it.product !== null
                            ? Number((it.product as { costUSD?: number }).costUSD)
                            : 0)) ||
                          0,
                      ),
                    0,
                  );
                  return (
                    <tr key={c.id} className="hover:bg-slate-800/30">
                      <td className="p-3 font-mono text-white">#{c.id}</td>
                      <td className="p-3 text-slate-200">{whName}</td>
                      <td className="p-3 text-slate-400 text-[11px]">
                        {new Date(c.createdAt).toLocaleString('es-VE')}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-300">
                        {(Array.isArray(c.items) ? c.items : []).length}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-300">
                        {formatUSD(adjustmentsCost)}
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant={c.status === 'completed' ? 'emerald' : 'amber'} size="sm">
                          {c.status === 'completed' ? 'Completado' : 'En progreso'}
                        </Badge>
                      </td>
                      <td className="p-3 text-center">
                        {c.status === 'in_progress' && (
                          <button
                            onClick={() => setSelectedCountId(c.id)}
                            className="text-indigo-400 hover:text-indigo-300 font-semibold"
                          >
                            Continuar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
