import React from 'react';
import Link from 'next/link';
import { ArrowLeft, TrendingUp, History } from 'lucide-react';
import { formatUSD, formatVES } from './KpiCard';
import { ManualRateForm } from './modals/ManualRateForm';
import type { RatesPageData } from '@/utilities/erpData';

interface RatesViewProps {
  tenantId: number;
  tenantSlug: string;
  tenantName: string;
  currencyConfig: {
    manualExchangeRate?: number | null;
    autoSyncRate?: boolean | null;
  } | null;
  data: RatesPageData;
}

const SOURCE_LABELS: Record<string, string> = {
  manual_tenant: 'Tasa manual del inquilino',
  bcv_oficial: 'BCV Oficial',
  binance_p2p: 'Binance P2P',
  dolar_paralelo: 'Dólar Paralelo',
  fallback_manual: 'Manual (fallback)',
  default_unit: 'Sin tasa configurada',
};

/**
 * Página de tasas (Sprint 21): tasas en vivo por fuente, tasa efectiva del
 * inquilino, configuración manual (sólo admin la edita) e historial de
 * snapshots (price-history + facturas recientes).
 */
export function RatesView({ tenantId, tenantSlug, tenantName, currencyConfig, data }: RatesViewProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/${tenantSlug}/erp`}
              className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" />
              Dashboard
            </Link>
            <span className="text-slate-600">/</span>
            <span className="text-xs font-semibold text-indigo-400">Tasas de Cambio</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Tasas de Cambio</h1>
          <p className="text-xs text-slate-400 mt-1">
            Fuentes en vivo y trazabilidad de la tasa aplicada en cada documento (snapshot inmutable).
          </p>
        </div>
      </div>

      {/* Tasas en vivo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4">
          <p className="text-[11px] uppercase font-semibold text-indigo-300">Tasa Efectiva (aplicada)</p>
          <div className="mt-1 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-indigo-400" />
            <span className="text-xl font-bold text-white font-mono">{formatUSD(data.effectiveRate)}</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">{SOURCE_LABELS[data.rateSource] || data.rateSource}</p>
        </div>
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">BCV Oficial</p>
          <div className="mt-1">
            <span className="text-xl font-bold text-white font-mono">
              {data.live.bcv ? formatUSD(data.live.bcv) : '—'}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Binance P2P</p>
          <div className="mt-1">
            <span className="text-xl font-bold text-white font-mono">
              {data.live.binance ? formatUSD(data.live.binance) : '—'}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Dólar Paralelo</p>
          <div className="mt-1">
            <span className="text-xl font-bold text-white font-mono">
              {data.live.paralelo ? formatUSD(data.live.paralelo) : '—'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Act. {new Date(data.live.lastUpdated).toLocaleTimeString('es-VE')}
          </p>
        </div>
      </div>

      {/* Configuración del inquilino */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-5">
        <h2 className="text-sm font-semibold text-white mb-3">Configuración de Tasa del Inquilino</h2>
        <p className="text-[11px] text-slate-500 mb-3">
          Estado actual: {currencyConfig?.autoSyncRate === false ? 'tasa MANUAL' : 'sincronización AUTOMÁTICA'}
          {currencyConfig?.manualExchangeRate
            ? ` · tasa manual guardada: ${formatVES(Number(currencyConfig.manualExchangeRate))}`
            : ''}
        </p>
        {data.canEdit ? (
          <ManualRateForm
            tenantId={tenantId}
            tenantSlug={tenantSlug}
            tenantName={tenantName}
            manualExchangeRate={Number(currencyConfig?.manualExchangeRate) || 0}
            autoSyncRate={currencyConfig?.autoSyncRate !== false}
          />
        ) : (
          <p className="text-[11px] text-slate-500">
            Sólo un administrador puede modificar la configuración de tasa.
          </p>
        )}
      </div>

      {/* Historial de snapshots: price-history */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden backdrop-blur">
        <div className="p-4 border-b border-slate-800/80 flex items-center gap-2">
          <History className="h-4 w-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-white">Historial de Cambios de Precio (con tasa aplicada)</h2>
          <span className="text-xs text-slate-400 ml-auto">últimos {data.priceHistory.length}</span>
        </div>
        {data.priceHistory.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-8">Sin cambios de precio registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Producto</th>
                  <th className="p-3 text-right">Antes</th>
                  <th className="p-3 text-right">Nuevo (USD)</th>
                  <th className="p-3 text-right">Nuevo (VES)</th>
                  <th className="p-3 text-right">Tasa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {data.priceHistory.map((ph) => (
                  <tr key={ph.id} className="hover:bg-slate-800/30">
                    <td className="p-3 text-slate-400 text-[11px]">{new Date(ph.date).toLocaleString('es-VE')}</td>
                    <td className="p-3 text-slate-200">{ph.productName}</td>
                    <td className="p-3 text-right font-mono text-slate-400">{formatUSD(ph.oldPriceUSD)}</td>
                    <td className="p-3 text-right font-mono font-bold text-white">{formatUSD(ph.newPriceUSD)}</td>
                    <td className="p-3 text-right font-mono text-emerald-400">{formatVES(ph.newPriceVES)}</td>
                    <td className="p-3 text-right font-mono text-slate-400">{formatUSD(ph.exchangeRateSnapshot)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Historial de tasas de facturas recientes */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden backdrop-blur">
        <div className="p-4 border-b border-slate-800/80 flex items-center gap-2">
          <History className="h-4 w-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-white">Tasa Snapshot de Facturas Recientes</h2>
          <span className="text-xs text-slate-400 ml-auto">últimas {data.invoiceHistory.length}</span>
        </div>
        {data.invoiceHistory.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-8">Sin facturas emitidas todavía.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                  <th className="p-3">Factura</th>
                  <th className="p-3">Fecha</th>
                  <th className="p-3 text-right">Tasa Snapshot</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {data.invoiceHistory.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-800/30">
                    <td className="p-3 font-mono font-bold text-white">{inv.invoiceNumber}</td>
                    <td className="p-3 text-slate-400 text-[11px]">{new Date(inv.date).toLocaleString('es-VE')}</td>
                    <td className="p-3 text-right font-mono text-slate-200">{formatUSD(inv.exchangeRateSnapshot)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
