import React from 'react';
import { TrendingUp, History, Landmark, Bitcoin, Scale, FileText } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { formatUSD, formatVES } from './format';
import { KpiCard } from './KpiCard';
import { ErpPageHeader } from './ErpPageHeader';
import { RateSpreadCard } from './charts/RateSpreadCard';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
 * Página de tasas (Sprint 21 → reskin Sprint 36): tasas en vivo por fuente,
 * spread contra la tasa efectiva, configuración manual (sólo admin la edita)
 * e historial de snapshots (price-history + facturas recientes).
 */
export function RatesView({ tenantId, tenantSlug, tenantName, currencyConfig, data }: RatesViewProps) {
  return (
    <div className="space-y-6">
      <ErpPageHeader
        title="Tasas de Cambio"
        description="Fuentes en vivo y trazabilidad de la tasa aplicada en cada documento (snapshot inmutable)."
        breadcrumbHref={`/${tenantSlug}/erp`}
        section="Tasas de Cambio"
      />

      {/* Tasas en vivo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Tasa Efectiva (aplicada)"
          valueUSD={data.effectiveRate}
          icon={TrendingUp}
          description={SOURCE_LABELS[data.rateSource] || data.rateSource}
          sparklineColor="var(--chart-1)"
        />
        <KpiCard
          title="BCV Oficial"
          valueUSD={data.live.bcv ? data.live.bcv : '—'}
          icon={Landmark}
        />
        <KpiCard
          title="Binance P2P"
          valueUSD={data.live.binance ? data.live.binance : '—'}
          icon={Bitcoin}
        />
        <KpiCard
          title="Dólar Paralelo"
          valueUSD={data.live.paralelo ? data.live.paralelo : '—'}
          icon={Scale}
          description={`Act. ${new Date(data.live.lastUpdated).toLocaleTimeString('es-VE')}`}
        />
      </div>

      {/* Spread entre fuentes (pieza distintiva del módulo) */}
      <RateSpreadCard
        effectiveRate={data.effectiveRate}
        rateSource={data.rateSource}
        live={data.live}
      />

      {/* Configuración del inquilino */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground mb-3">Configuración de Tasa del Inquilino</h2>
        <p className="text-[11px] text-muted-foreground mb-3">
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
          <p className="text-[11px] text-muted-foreground">
            Sólo un administrador puede modificar la configuración de tasa.
          </p>
        )}
      </div>

      {/* Historial de snapshots: price-history */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">Historial de Cambios de Precio (con tasa aplicada)</h2>
          <span className="text-xs text-muted-foreground ml-auto">últimos {data.priceHistory.length}</span>
        </div>
        {data.priceHistory.length === 0 ? (
          <EmptyState icon={History} title="Sin cambios de precio registrados." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Fecha</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Antes</TableHead>
                  <TableHead className="text-right">Nuevo (USD)</TableHead>
                  <TableHead className="text-right">Nuevo (VES)</TableHead>
                  <TableHead className="text-right">Tasa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.priceHistory.map((ph) => (
                  <TableRow key={ph.id}>
                    <TableCell className="text-muted-foreground text-[11px]">{new Date(ph.date).toLocaleString('es-VE')}</TableCell>
                    <TableCell>{ph.productName}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{formatUSD(ph.oldPriceUSD)}</TableCell>
                    <TableCell className="text-right font-mono font-bold">{formatUSD(ph.newPriceUSD)}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400">{formatVES(ph.newPriceVES)}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{formatUSD(ph.exchangeRateSnapshot)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Historial de tasas de facturas recientes */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">Tasa Snapshot de Facturas Recientes</h2>
          <span className="text-xs text-muted-foreground ml-auto">últimas {data.invoiceHistory.length}</span>
        </div>
        {data.invoiceHistory.length === 0 ? (
          <EmptyState icon={FileText} title="Sin facturas emitidas todavía." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Factura</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Tasa Snapshot</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.invoiceHistory.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono font-bold">{inv.invoiceNumber}</TableCell>
                    <TableCell className="text-muted-foreground text-[11px]">{new Date(inv.date).toLocaleString('es-VE')}</TableCell>
                    <TableCell className="text-right font-mono">{formatUSD(inv.exchangeRateSnapshot)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
