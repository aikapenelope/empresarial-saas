'use client';

import React, { useState } from 'react';
import { formatUSD, formatVES } from './format';
import { Loader2, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface PricingReportEntry {
  sku: string;
  name: string;
  priceUSD: number;
  suggestedPriceVES: number;
  tiers: Array<{ tier: string; priceUSD: number; suggestedPriceVES: number }>;
}

/**
 * Consumo del reporte `POST /api/pricing/report` (Sprint 16 → reskin 37):
 * precios sugeridos en VES con la tasa vigente. Informativo — los ajustes se
 * aplican manualmente (edición de producto o importación) y quedan en
 * price-history.
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
        setOpen(true);
      }
    } catch {
      setError('Error de red al generar el reporte.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">Reporte de Precios (VES)</h2>
        </div>
        <div className="flex items-center gap-2">
          {report && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setOpen(!open)}
            >
              {open ? 'Ocultar' : 'Ver'}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            <span>{report ? 'Regenerar' : 'Generar'}</span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-rose-600 dark:text-rose-400 text-xs" role="alert">
          {error}
        </div>
      )}

      {open && report && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Tasa vigente: <span className="font-mono text-foreground">{formatVES(report.effectiveRate)}</span> ({report.rateSource}) ·{' '}
            {report.totalProducts} producto(s) · generado {new Date(report.generatedAt).toLocaleString('es-VE')}.{' '}
            <span className="text-muted-foreground/80">
              Informativo: los ajustes se aplican editando cada producto y quedan en el historial de precios.
            </span>
          </p>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>SKU</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Precio USD</TableHead>
                  <TableHead className="text-right">Sugerido VES</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.products.map((p) => (
                  <TableRow key={p.sku}>
                    <TableCell className="font-mono text-muted-foreground">{p.sku}</TableCell>
                    <TableCell>{p.name}</TableCell>
                    <TableCell className="text-right font-mono">{formatUSD(p.priceUSD)}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400">
                      {formatVES(p.suggestedPriceVES)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </Card>
  );
}
