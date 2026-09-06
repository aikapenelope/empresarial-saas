'use client';

import React, { useState } from 'react';
import { Badge } from './Badge';
import { formatUSD, formatVES } from './KpiCard';
import { Loader2, TrendingUp, X } from 'lucide-react';

interface PricingReportEntry {
  sku: string;
  name: string;
  priceUSD: number;
  suggestedPriceVES: number;
  tiers: Array<{ tier: string; priceUSD: number; suggestedPriceVES: number }>;
}

/**
 * Consumo del reporte `POST /api/pricing/report` (Sprint 16): precios sugeridos
 * en VES con la tasa vigente. Informativo — los ajustes se aplican manualmente
 * (edición de producto o importación) y quedan en price-history.
 */
export function PricingReportCard({ tenantId }: { tenantId: number }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<{
    effectiveRate: number;
    rateSource: string;
    generatedAt: string;
    totalProducts: number;
    products: PricingReportEntry[];
  } | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/pricing/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Error al generar el reporte.');
      } else {
        setReport(json);
      }
    } catch {
      setError('Error de red al generar el reporte.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-amber-400" />
          <h2 className="text-sm font-semibold text-white">Reporte de Precios (VES)</h2>
        </div>
        <div className="flex items-center gap-2">
          {report && (
            <button
              onClick={() => setOpen(!open)}
              className="text-indigo-400 hover:text-indigo-300 text-xs font-semibold"
            >
              {open ? 'Ocultar' : 'Ver'}
            </button>
          )}
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>{report ? 'Regenerar' : 'Generar'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {open && report && (
        <div className="space-y-2">
          <p className="text-[11px] text-slate-400">
            Tasa vigente: <span className="font-mono text-emerald-400">{formatVES(report.effectiveRate)}</span> ({report.rateSource}) ·{' '}
            {report.totalProducts} producto(s) · generado {new Date(report.generatedAt).toLocaleString('es-VE')}.{' '}
            <span className="text-slate-500">
              Informativo: los ajustes se aplican editando cada producto y quedan en el historial de precios.
            </span>
          </p>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-800">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] bg-slate-950/40">
                  <th className="p-2">SKU</th>
                  <th className="p-2">Producto</th>
                  <th className="p-2 text-right">Precio USD</th>
                  <th className="p-2 text-right">Sugerido VES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {report.products.map((p) => (
                  <tr key={p.sku} className="hover:bg-slate-800/30">
                    <td className="p-2 font-mono text-slate-400">{p.sku}</td>
                    <td className="p-2 text-white">{p.name}</td>
                    <td className="p-2 text-right font-mono text-slate-200">{formatUSD(p.priceUSD)}</td>
                    <td className="p-2 text-right font-mono text-emerald-400">
                      {formatVES(p.suggestedPriceVES)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
