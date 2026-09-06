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
  ArrowLeft,
} from 'lucide-react';
import { importStockAction } from '@/actions/erpActions';
import { Badge } from './Badge';

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

  return (
    <div className="space-y-6">
      {/* Instrucciones */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-5 space-y-3 text-xs">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-white">1. Prepara tu archivo CSV</h2>
        </div>
        <p className="text-slate-400">
          Dos columnas: <code className="px-1 py-0.5 rounded bg-slate-800 text-indigo-300 font-mono">sku</code> y{' '}
          <code className="px-1 py-0.5 rounded bg-slate-800 text-indigo-300 font-mono">cantidad</code>. Exporta tu hoja
          de cálculo como CSV UTF-8 (en Excel: &quot;Guardar como → CSV&quot;).
        </p>
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 font-mono text-[11px] text-slate-300">
          <div className="text-slate-500">sku,cantidad</div>
          <div>MP-HAR-01,50</div>
          <div>PT-PAN-01,-3</div>
        </div>
        <ul className="list-disc list-inside text-slate-400 space-y-1">
          <li>
            <strong className="text-slate-200">Modo Ajustar (Δ):</strong> la cantidad suma o resta (con signo) al stock
            actual del almacén.
          </li>
          <li>
            <strong className="text-slate-200">Modo Fijar:</strong> la cantidad es la existencia absoluta que debe
            quedar en el almacén.
          </li>
          <li>
            El stock resultante nunca puede quedar negativo: esas filas se rechazan con su motivo y el resto se importa.
          </li>
        </ul>
        <a
          href={`/${tenantSlug}/erp/inventory/import/template`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Descargar plantilla con tu catálogo actual (SKU + stock)</span>
        </a>
      </div>

      {/* Carga y configuración */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-5 space-y-4 text-xs">
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-white">2. Carga el archivo y configura la importación</h2>
        </div>

        {error && (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-rose-300">{error}</div>
        )}
        {parseError && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 text-amber-300">{parseError}</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block font-semibold text-slate-300 mb-1">Archivo CSV *</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white file:mr-3 file:px-3 file:py-1 file:rounded file:border-0 file:bg-indigo-600 file:text-white text-[11px]"
            />
            {fileName && <p className="text-[10px] text-slate-500 mt-1">{fileName}</p>}
          </div>

          <div>
            <label className="block font-semibold text-slate-300 mb-1">Modo</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as 'adjust' | 'set')}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="adjust">Ajustar (Δ suma/resta)</option>
              <option value="set">Fijar (existencia absoluta)</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-300 mb-1">Almacén de Destino *</label>
            <select
              value={warehouseId ?? ''}
              onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
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
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-300 font-semibold uppercase text-[10px]">
                Vista previa: {rows.length} fila(s) · {localErrors.length} inválida(s)
              </span>
            </div>
            <div className="max-h-56 overflow-y-auto">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                    <th className="py-1.5">#</th>
                    <th className="py-1.5">SKU</th>
                    <th className="py-1.5 text-right">Cantidad</th>
                    <th className="py-1.5">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {rows.map((r, i) => {
                    const invalid = !r.sku || !Number.isFinite(r.quantity);
                    return (
                      <tr key={i} className={invalid ? 'bg-rose-500/5' : ''}>
                        <td className="py-1.5 font-mono text-slate-500">{i + 2}</td>
                        <td className="py-1.5 font-mono text-white">{r.sku || '—'}</td>
                        <td className="py-1.5 text-right font-mono text-slate-300">
                          {Number.isFinite(r.quantity) ? r.quantity : '—'}
                        </td>
                        <td className="py-1.5">
                          {invalid ? (
                            <span className="text-rose-400">Fila inválida</span>
                          ) : (
                            <span className="text-emerald-400">OK</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || rows.length === 0 || localErrors.length > 0}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all disabled:opacity-50"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          <span>Importar al Kardex</span>
        </button>
      </div>

      {/* Resultados */}
      {result && (
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-5 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">3. Resultado de la importación</h2>
            <div className="flex items-center gap-2">
              <Badge variant="emerald" size="sm">
                {result.movementsCreated} movimiento(s)
              </Badge>
              <Badge variant="slate" size="sm">
                {result.rowsProcessed} fila(s) procesadas
              </Badge>
              {errorRows.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    downloadErrorsCsv(
                      errorRows.map((e) => ({ sku: e.sku, message: e.message || 'Error' })),
                    )
                  }
                  className="inline-flex items-center gap-1 text-rose-300 hover:text-rose-200 font-semibold"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Descargar errores</span>
                </button>
              )}
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                  <th className="py-1.5">SKU</th>
                  <th className="py-1.5">Movimiento</th>
                  <th className="py-1.5 text-right">Cantidad</th>
                  <th className="py-1.5">Detalle</th>
                  <th className="py-1.5 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {result.results.map((r, i) => (
                  <tr key={i}>
                    <td className="py-1.5 font-mono text-white">{r.sku}</td>
                    <td className="py-1.5 font-mono text-slate-300">{r.movement || '—'}</td>
                    <td className="py-1.5 text-right font-mono text-slate-300">{r.quantity ?? '—'}</td>
                    <td className="py-1.5 text-slate-400">{r.message}</td>
                    <td className="py-1.5 text-center">
                      {r.status === 'ok' ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 inline" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-rose-400 inline" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Link
            href={`/${tenantSlug}/erp/inventory`}
            className="inline-flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 font-semibold"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Volver al inventario</span>
          </Link>
        </div>
      )}
    </div>
  );
}
