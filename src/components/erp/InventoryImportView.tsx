'use client';

import React, { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Loader2,
  Download,
  AlertTriangle,
} from 'lucide-react';
import { importStockAction, previewStockImportAction } from '@/actions/erpActions';
import { Badge } from './Badge';
import { ErpPageHeader } from './ErpPageHeader';
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
import { cn } from '@/lib/utils';
import {
  detectColumn,
  parseCsvDocument,
  QTY_ALIASES,
  SKU_ALIASES,
} from '@/utilities/importCsv';

interface InventoryImportViewProps {
  tenantId: number;
  tenantSlug: string;
  warehouses: Array<{ id: number; name: string; code: string; isDefault?: boolean | null }>;
}

interface ParsedRow {
  sku: string;
  quantity: number;
  raw: string;
}

interface ImportPlan {
  warehouse: { id: number; name: string; code: string };
  results: Array<{ sku: string; status: string; movement?: string; quantity?: number; message?: string }>;
  movements: Array<{ sku: string; movementType: string; quantity: number }>;
  rowsProcessed: number;
}

type ImportSummary = {
  movementsCreated: number;
  rowsProcessed: number;
  results: Array<{ sku: string; status: string; movement?: string; quantity?: number; message?: string }>;
};

type Step = 'file' | 'mapping' | 'preview' | 'confirm' | 'result';

const STEP_LIST: Array<{ id: Step; label: string }> = [
  { id: 'file', label: '1. Archivo' },
  { id: 'mapping', label: '2. Mapeo' },
  { id: 'preview', label: '3. Dry-run' },
  { id: 'confirm', label: '4. Confirmar' },
  { id: 'result', label: '5. Resultado' },
];

/** Alias de columnas (misma filosofía que import.hooks.before del plugin oficial). */
function toRow(cells: string[], skuCol: number, qtyCol: number): ParsedRow {
  const raw = cells.join(',');
  const sku = (cells[skuCol] ?? '').trim();
  const quantityRaw = (cells[qtyCol] ?? '').replace(',', '.');
  return { sku, quantity: quantityRaw === '' ? Number.NaN : Number(quantityRaw), raw };
}

function downloadErrorsCsv(errors: Array<{ sku: string; message: string }>) {
  const csv = ['sku,error', ...errors.map((e) => `${e.sku},"${e.message.replace(/"/g, '""')}"`)].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `errores-importacion-inventario-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Wizard de importación de inventario (IE-PR7): archivo → mapeo de columnas →
 * dry-run (planStockImport vía previewStockImportAction, sin escrituras) →
 * confirmar (importStockAction recalcula el plan al confirmar) → resultado con
 * detección de drift entre lo previsualizado y lo realmente aplicado.
 */
export function InventoryImportView({ tenantId, tenantSlug, warehouses }: InventoryImportViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('file');
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[] | null>(null);
  const [lines, setLines] = useState<string[][]>([]);
  const [skuCol, setSkuCol] = useState(0);
  const [qtyCol, setQtyCol] = useState(1);
  const [parseError, setParseError] = useState<string | null>(null);
  const [mode, setMode] = useState<'adjust' | 'set'>('adjust');
  const [warehouseId, setWarehouseId] = useState<number | undefined>(
    warehouses.find((w) => w.isDefault)?.id ?? warehouses[0]?.id,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewPlan, setPreviewPlan] = useState<ImportPlan | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [driftCount, setDriftCount] = useState(0);

  const rows: ParsedRow[] = useMemo(
    () => lines.map((cells) => toRow(cells, skuCol, qtyCol)),
    [lines, skuCol, qtyCol],
  );
  const localErrors = useMemo(
    () => rows.filter((r) => !r.sku || !Number.isFinite(r.quantity)),
    [rows],
  );

  const columnOptions = headers ?? ['Columna 1', 'Columna 2'];

  const handleFile = (file: File) => {
    setParseError(null);
    setError(null);
    setResult(null);
    setPreviewPlan(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const parsed = parseCsvDocument(text);
      if (parsed.lines.length === 0) {
        setParseError('El archivo no contiene filas. Formato esperado: sku,cantidad');
        setLines([]);
        return;
      }
      setHeaders(parsed.headers);
      setLines(parsed.lines);
      setSkuCol(detectColumn(parsed.headers, SKU_ALIASES, 0));
      setQtyCol(detectColumn(parsed.headers, QTY_ALIASES, 1));
      setStep('mapping');
    };
    reader.onerror = () => setParseError('No se pudo leer el archivo.');
    reader.readAsText(file, 'utf-8');
  };

  const resetAll = () => {
    setStep('file');
    setLines([]);
    setHeaders(null);
    setFileName(null);
    setPreviewPlan(null);
    setResult(null);
    setDriftCount(0);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const runPreview = async () => {
    setError(null);
    if (skuCol === qtyCol) {
      setError('La columna de SKU y la de cantidad no pueden ser la misma.');
      return;
    }
    if (rows.length === 0) {
      setError('No hay filas para importar.');
      return;
    }
    if (localErrors.length > 0) {
      setError('Corrige las filas inválidas (resaltadas) antes de continuar.');
      return;
    }
    if (!warehouseId) {
      setError('Selecciona un almacén de destino.');
      return;
    }

    setLoading(true);
    const res = await previewStockImportAction({
      tenantId,
      tenantSlug,
      warehouseId,
      mode,
      rows: rows.map((r) => ({ sku: r.sku, quantity: r.quantity })),
    });
    setLoading(false);

    if (res.success) {
      setPreviewPlan(res.data as ImportPlan);
      setStep('preview');
    } else {
      setError(res.error || 'Error al previsualizar la importación.');
    }
  };

  const handleConfirm = async () => {
    setError(null);
    if (!warehouseId) {
      setError('Selecciona un almacén de destino.');
      return;
    }
    const targetWarehouseId = warehouseId;
    setLoading(true);
    const res = await importStockAction({
      tenantId,
      tenantSlug,
      warehouseId: targetWarehouseId,
      mode,
      rows: rows.map((r) => ({ sku: r.sku, quantity: r.quantity })),
    });
    setLoading(false);

    if (res.success) {
      const summary = res.data as ImportSummary;
      // Drift (IE-PR7): si el stock cambió entre el dry-run y el confirm, el
      // commit recalculó — marcamos cuántas filas difieren del preview.
      const preview = previewPlan?.results ?? [];
      let drift = 0;
      // Devin #84: el drift compara TAMBIÉN el tipo de movimiento — un set
      // cuyo stock cruzó el objetivo invierte entrada↔salida con la misma
      // cantidad absoluta, y sin esto se reportaba como "sin drift".
      summary.results.forEach((r, i) => {
        const p = preview[i];
        if (
          !p ||
          p.status !== r.status ||
          p.movement !== r.movement ||
          (p.quantity ?? 0) !== (r.quantity ?? 0)
        ) {
          drift += 1;
        }
      });
      setDriftCount(drift);
      setResult(summary);
      setStep('result');
    } else {
      setError(res.error || 'Error al importar el inventario.');
    }
  };

  const errorRows = result?.results.filter((r) => r.status === 'error') || [];
  const planErrorRows = previewPlan?.results.filter((r) => r.status === 'error') || [];
  const okCount = previewPlan ? previewPlan.results.filter((r) => r.status === 'ok' && r.movement !== 'none').length : 0;
  const noneCount = previewPlan ? previewPlan.results.filter((r) => r.movement === 'none').length : 0;

  const selectClass = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground';
  const currentStepIndex = STEP_LIST.findIndex((s) => s.id === step);

  return (
    <div className="space-y-6">
      <ErpPageHeader
        title="Importación de Inventario (CSV)"
        description="Actualiza existencias por lote desde una hoja de cálculo: mapeo de columnas, dry-run validado y confirmación explícita antes de escribir el Kardex."
        breadcrumbHref={`/${tenantSlug}/erp/inventory`}
        breadcrumbLabel="Inventario"
        section="Importar"
      />

      {/* Stepper (tablist accesible) */}
      <div role="tablist" aria-label="Pasos de la importación" className="flex flex-wrap gap-2">
        {STEP_LIST.map((s, idx) => (
          <button
            key={s.id}
            role="tab"
            type="button"
            aria-selected={s.id === step}
            disabled={idx > currentStepIndex}
            onClick={() => {
              // Sólo retroceder libremente; avanzar lo hacen los botones de cada paso.
              if (idx < currentStepIndex) setStep(s.id);
            }}
            className={cn(
              'px-3 py-1.5 rounded-full border text-[11px] font-semibold transition-colors',
              s.id === step
                ? 'border-primary bg-primary text-primary-foreground'
                : idx < currentStepIndex
                  ? 'border-border bg-muted text-foreground cursor-pointer'
                  : 'border-border bg-card text-muted-foreground cursor-not-allowed',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Paso 1: Archivo */}
      {step === 'file' && (
        <Card className="rounded-xl p-5 space-y-3 text-xs">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">Prepara y carga tu archivo CSV</h2>
          </div>
          <p className="text-muted-foreground">
            Dos columnas: <code className="px-1 py-0.5 rounded bg-muted text-foreground font-mono">sku</code> y{' '}
            <code className="px-1 py-0.5 rounded bg-muted text-foreground font-mono">cantidad</code>. Exporta tu hoja
            de cálculo como CSV UTF-8 (en Excel: &quot;Guardar como → CSV&quot;).
          </p>
          <div className="rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px] text-foreground">
            <div className="text-muted-foreground">sku,cantidad</div>
            <div>MP-HAR-01,50</div>
            <div>PT-PAN-01,-3</div>
          </div>
          <ul className="list-disc list-inside text-muted-foreground space-y-1">
            <li>
              <strong className="text-foreground">Modo Ajustar (Δ):</strong> la cantidad suma o resta (con signo) al
              stock actual del almacén.
            </li>
            <li>
              <strong className="text-foreground">Modo Fijar:</strong> la cantidad es la existencia absoluta que debe
              quedar en el almacén.
            </li>
            <li>
              El stock resultante nunca puede quedar negativo: esas filas se rechazan en el dry-run, antes de tocar el
              Kardex.
            </li>
          </ul>
          <Button variant="outline" size="sm" asChild>
            <a href={`/${tenantSlug}/erp/inventory/import/template`}>
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Descargar plantilla con tu catálogo actual (SKU + stock)
            </a>
          </Button>

          <div className="pt-2">
            <label className="block font-semibold text-foreground mb-1" htmlFor="import-file">
              Archivo CSV *
            </label>
            <input
              id="import-file"
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground file:mr-3 file:px-3 file:py-1 file:rounded file:border-0 file:bg-primary file:text-primary-foreground text-[11px]"
            />
            {fileName && <p className="text-[10px] text-muted-foreground mt-1">{fileName}</p>}
          </div>

          <Button type="button" size="lg" disabled={lines.length === 0} onClick={() => setStep('mapping')}>
            Continuar al mapeo
          </Button>
        </Card>
      )}

      {/* Pasos 2-4 */}
      {step !== 'file' && step !== 'result' && (
        <Card className="rounded-xl p-5 space-y-4 text-xs">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">
              {step === 'mapping' && 'Mapeo de columnas y configuración'}
              {step === 'preview' && 'Dry-run: plan de importación (sin escrituras)'}
              {step === 'confirm' && 'Confirmar e importar al Kardex'}
            </h2>
            {fileName && <Badge variant="slate" size="sm">{fileName}</Badge>}
          </div>

          {error && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-rose-600 dark:text-rose-400" role="alert">
              {error}
            </div>
          )}
          {parseError && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 text-amber-600 dark:text-amber-400" role="alert">
              {parseError}
            </div>
          )}

          {step === 'mapping' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block font-semibold text-foreground mb-1" htmlFor="map-sku">
                    Columna SKU *
                  </label>
                  <select
                    id="map-sku"
                    value={skuCol}
                    onChange={(e) => setSkuCol(Number(e.target.value))}
                    className={selectClass}
                  >
                    {columnOptions.map((h, i) => (
                      <option key={i} value={i}>
                        {headers ? h : `${h} (${lines[0]?.[i] ?? '—'})`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-foreground mb-1" htmlFor="map-qty">
                    Columna Cantidad *
                  </label>
                  <select
                    id="map-qty"
                    value={qtyCol}
                    onChange={(e) => setQtyCol(Number(e.target.value))}
                    className={selectClass}
                  >
                    {columnOptions.map((h, i) => (
                      <option key={i} value={i}>
                        {headers ? h : `${h} (${lines[0]?.[i] ?? '—'})`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-foreground mb-1" htmlFor="import-mode">
                    Modo
                  </label>
                  <select
                    id="import-mode"
                    value={mode}
                    onChange={(e) => setMode(e.target.value as 'adjust' | 'set')}
                    className={selectClass}
                  >
                    <option value="adjust">Ajustar (Δ suma/resta)</option>
                    <option value="set">Fijar (existencia absoluta)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-foreground mb-1" htmlFor="import-warehouse">
                    Almacén de Destino *
                  </label>
                  <select
                    id="import-warehouse"
                    value={warehouseId ?? ''}
                    onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : undefined)}
                    className={selectClass}
                  >
                    <option value="">-- Selecciona --</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.code}){w.isDefault ? ' ★' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {headers && (
                <p className="text-[10px] text-muted-foreground">
                  Columnas no mapeadas se descartan: {headers.filter((_, i) => i !== skuCol && i !== qtyCol).join(', ') || 'ninguna'}.
                </p>
              )}

              {/* Vista previa del mapeo */}
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                <span className="text-foreground font-semibold uppercase text-[10px]">
                  Mapeo aplicado: {rows.length} fila(s) · {localErrors.length} inválida(s)
                </span>
                <div className="max-h-56 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>#</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Cantidad</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r, i) => {
                        const invalid = !r.sku || !Number.isFinite(r.quantity);
                        return (
                          <TableRow key={i} className={invalid ? 'bg-rose-500/5' : ''}>
                            <TableCell className="py-1.5 font-mono text-muted-foreground">{i + 2}</TableCell>
                            <TableCell className="py-1.5 font-mono">{r.sku || '—'}</TableCell>
                            <TableCell className="py-1.5 text-right font-mono">
                              {Number.isFinite(r.quantity) ? r.quantity : '—'}
                            </TableCell>
                            <TableCell className="py-1.5">
                              {invalid ? (
                                <span className="text-rose-600 dark:text-rose-400">Fila inválida</span>
                              ) : (
                                <span className="text-emerald-600 dark:text-emerald-400">OK</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setStep('file')}>
                  Volver al archivo
                </Button>
                <Button
                  type="button"
                  size="lg"
                  onClick={runPreview}
                  disabled={loading || rows.length === 0 || localErrors.length > 0 || !warehouseId || skuCol === qtyCol}
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  <span>Ejecutar dry-run</span>
                </Button>
              </div>
            </>
          )}

          {step === 'preview' && previewPlan && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="emerald" size="sm" dot>
                  {previewPlan.movements.length} movimiento(s) propuesto(s)
                </Badge>
                <Badge variant="slate" size="sm">
                  {okCount} fila(s) por aplicar
                </Badge>
                <Badge variant="slate" size="sm">
                  {noneCount} sin cambio neto
                </Badge>
                {planErrorRows.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-rose-600 dark:text-rose-400"
                    onClick={() =>
                      downloadErrorsCsv(
                        planErrorRows.map((e) => ({ sku: e.sku, message: e.message || 'Error' })),
                      )
                    }
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Descargar errores ({planErrorRows.length})</span>
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Se aplicarán las filas válidas; las filas con error se omiten. Este plan NO ha escrito nada en el
                Kardex — el stock se revalida al confirmar.
              </p>
              <div className="max-h-72 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>SKU</TableHead>
                      <TableHead>Movimiento</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead>Detalle</TableHead>
                      <TableHead className="text-center">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewPlan.results.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono">{r.sku}</TableCell>
                        <TableCell className="font-mono text-muted-foreground">{r.movement || '—'}</TableCell>
                        <TableCell className="text-right font-mono">{r.quantity ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{r.message}</TableCell>
                        <TableCell className="text-center">
                          {r.status === 'ok' ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 inline" aria-hidden="true" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-rose-500 inline" aria-hidden="true" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setStep('mapping')}>
                  Volver al mapeo
                </Button>
                <Button type="button" size="lg" onClick={() => setStep('confirm')}>
                  Continuar a confirmar
                </Button>
              </div>
            </>
          )}

          {step === 'confirm' && previewPlan && (
            <>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5" aria-hidden="true" />
                <div className="text-[11px] text-amber-700 dark:text-amber-300 space-y-1">
                  <p className="font-bold text-amber-600 dark:text-amber-400">
                    Estás por escribir {previewPlan.movements.length} movimiento(s) en el Kardex de{' '}
                    {previewPlan.warehouse.name}.
                  </p>
                  <p>
                    El Kardex es inmutable: los movimientos creados no se pueden editar, sólo compensar. El plan se
                    revalida con el stock vigente al confirmar.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setStep('preview')}>
                  Volver al dry-run
                </Button>
                <Button
                  type="button"
                  size="lg"
                  onClick={handleConfirm}
                  disabled={loading || previewPlan.movements.length === 0}
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  <span>Confirmar e importar al Kardex</span>
                </Button>
              </div>
            </>
          )}
        </Card>
      )}

      {/* Paso 5: Resultado */}
      {step === 'result' && result && (
        <Card className="rounded-xl p-5 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Resultado de la importación</h2>
            <div className="flex items-center gap-2">
              <Badge variant="emerald" size="sm" dot>
                {result.movementsCreated} movimiento(s)
              </Badge>
              <Badge variant="slate" size="sm">
                {result.rowsProcessed} fila(s) procesadas
              </Badge>
              {driftCount > 0 && (
                <Badge variant="amber" size="sm">
                  {driftCount} fila(s) difirieron del dry-run (stock cambió entre pasos)
                </Badge>
              )}
              {errorRows.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-rose-600 dark:text-rose-400"
                  onClick={() =>
                    downloadErrorsCsv(
                      errorRows.map((e) => ({ sku: e.sku, message: e.message || 'Error' })),
                    )
                  }
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Descargar errores</span>
                </Button>
              )}
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>SKU</TableHead>
                  <TableHead>Movimiento</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.results.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono">{r.sku}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">{r.movement || '—'}</TableCell>
                    <TableCell className="text-right font-mono">{r.quantity ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{r.message}</TableCell>
                    <TableCell className="text-center">
                      {r.status === 'ok' ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 inline" aria-hidden="true" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-rose-500 inline" aria-hidden="true" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center gap-3">
            <Button type="button" size="sm" onClick={resetAll}>
              Nueva importación
            </Button>
            <Button variant="link" size="sm" asChild>
              <Link href={`/${tenantSlug}/erp/inventory`}>
                <span>Volver al inventario</span>
              </Link>
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
