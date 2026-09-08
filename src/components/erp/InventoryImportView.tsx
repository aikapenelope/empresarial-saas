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
} from 'lucide-react';
import { importStockAction } from '@/actions/erpActions';
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

/** Parser CSV mínimo (delimitador coma o punto y coma, sin comillas multilínea). */
function parseCsv(text: string): ParsedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const rows: ParsedRow[] = [];

  lines.forEach((line, index) => {
    // Saltar encabezado (sku / cantidad | quantity)
    if (index === 0 && /sku/i.test(line) && /cantidad|quantity/i.test(line)) return;

    const delimiter = (line.match(/;/g)?.length || 0) > (line.match(/,/g)?.length || 0) ? ';' : ',';
    const cols = line.split(delimiter).map((c) => c.trim());
    const sku = cols[0] || '';
    const quantityRaw = (cols[1] || '').replace(',', '.');
    const quantity = Number(quantityRaw);

    rows.push({
      sku,
      quantity: quantityRaw === '' ? Number.NaN : quantity,
      raw: line,
    });
  });

  return rows;
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

export function InventoryImportView({ tenantId, tenantSlug, warehouses }: InventoryImportViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [mode, setMode] = useState<'adjust' | 'set'>('adjust');
  const [warehouseId, setWarehouseId] = useState<number | undefined>(
    warehouses.find((w) => w.isDefault)?.id ?? warehouses[0]?.id,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    movementsCreated: number;
    rowsProcessed: number;
    results: Array<{ sku: string; status: string; movement?: string; quantity?: number; message?: string }>;
  } | null>(null);

  const localErrors = useMemo(
    () => rows.filter((r) => !r.sku || !Number.isFinite(r.quantity)),
    [rows],
  );

  const handleFile = (file: File) => {
    setParseError(null);
    setResult(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        setParseError('El archivo no contiene filas. Formato esperado: sku,cantidad');
        setRows([]);
        return;
      }
      setRows(parsed);
    };
    reader.onerror = () => setParseError('No se pudo leer el archivo.');
    reader.readAsText(file, 'utf-8');
  };

  const handleSubmit = async () => {
    setError(null);
    if (rows.length === 0) {
      setError('No hay filas para importar.');
      return;
    }
    if (localErrors.length > 0) {
      setError('Corrige las filas inválidas (resaltadas) antes de importar.');
      return;
    }
    if (!warehouseId) {
      setError('Selecciona un almacén de destino.');
      return;
    }

    setLoading(true);
    const res = await importStockAction({
      tenantId,
      tenantSlug,
      warehouseId,
      mode,
      rows: rows.map((r) => ({ sku: r.sku, quantity: r.quantity })),
    });
    setLoading(false);

    if (res.success) {
      setResult(res.data as { movementsCreated: number; rowsProcessed: number; results: Array<{ sku: string; status: string; movement?: string; quantity?: number; message?: string }> });
      setRows([]);
      setFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } else {
      setError(res.error || 'Error al importar el inventario.');
    }
  };

  const errorRows = result?.results.filter((r) => r.status === 'error') || [];

  const selectClass = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground';

  return (
    <div className="space-y-6">
      <ErpPageHeader
        title="Importación de Inventario (CSV)"
        description="Actualiza existencias por lote desde una hoja de cálculo: ajustes Δ o fijación absoluta, con vista previa validada antes de escribir el Kardex."
        breadcrumbHref={`/${tenantSlug}/erp/inventory`}
        breadcrumbLabel="Inventario"
        section="Importar"
      />

      {/* Instrucciones */}
      <Card className="rounded-xl p-5 space-y-3 text-xs">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">1. Prepara tu archivo CSV</h2>
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
            <strong className="text-foreground">Modo Ajustar (Δ):</strong> la cantidad suma o resta (con signo) al stock
            actual del almacén.
          </li>
          <li>
            <strong className="text-foreground">Modo Fijar:</strong> la cantidad es la existencia absoluta que debe
            quedar en el almacén.
          </li>
          <li>
            El stock resultante nunca puede quedar negativo: esas filas se rechazan con su motivo y el resto se importa.
          </li>
        </ul>
        <Button variant="outline" size="sm" asChild>
          <a href={`/${tenantSlug}/erp/inventory/import/template`}>
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Descargar plantilla con tu catálogo actual (SKU + stock)
          </a>
        </Button>
      </Card>

      {/* Carga y configuración */}
      <Card className="rounded-xl p-5 space-y-4 text-xs">
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">2. Carga el archivo y configura la importación</h2>
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
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

        {/* Vista previa */}
        {rows.length > 0 && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-foreground font-semibold uppercase text-[10px]">
                Vista previa: {rows.length} fila(s) · {localErrors.length} inválida(s)
              </span>
            </div>
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
        )}

        <Button
          type="button"
          size="lg"
          onClick={handleSubmit}
          disabled={loading || rows.length === 0 || localErrors.length > 0}
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          <span>Importar al Kardex</span>
        </Button>
      </Card>

      {/* Resultados */}
      {result && (
        <Card className="rounded-xl p-5 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">3. Resultado de la importación</h2>
            <div className="flex items-center gap-2">
              <Badge variant="emerald" size="sm" dot>
                {result.movementsCreated} movimiento(s)
              </Badge>
              <Badge variant="slate" size="sm">
                {result.rowsProcessed} fila(s) procesadas
              </Badge>
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

          <Button variant="link" size="sm" asChild>
            <Link href={`/${tenantSlug}/erp/inventory`}>
              <span>Volver al inventario</span>
            </Link>
          </Button>
        </Card>
      )}
    </div>
  );
}
