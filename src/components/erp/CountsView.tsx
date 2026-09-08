'use client';

import React, { useMemo, useState } from 'react';
import {
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
import { ErpPageHeader } from './ErpPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
      <ErpPageHeader
        title="Conteos Cíclicos de Inventario"
        description="Crea el conteo (snapshot del sistema) → cuenta el físico → completa: los ajustes entran por el Kardex."
        breadcrumbHref={`/${tenantSlug}/erp/inventory`}
        breadcrumbLabel="Inventario"
        section="Conteos Cíclicos"
      />

      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400" role="alert">
          {error}
        </div>
      )}

      {/* Paso 1: Crear */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3 text-xs">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">1. Nuevo Conteo</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block font-semibold text-foreground mb-1" htmlFor="count-warehouse">
              Almacén a Contar *
            </label>
            <select
              id="count-warehouse"
              value={warehouseId ?? ''}
              onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-semibold text-foreground mb-1" htmlFor="count-notes">
              Notas
            </label>
            <Input
              id="count-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Corte mensual bodega principal"
            />
          </div>
          <Button type="button" onClick={handleCreate} disabled={loading || !warehouseId}>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            <span>Crear Conteo</span>
          </Button>
        </div>
      </div>

      {/* Paso 2: Contar */}
      {activeCount && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-foreground">
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
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Sistema</TableHead>
                  <TableHead className="text-right">Contado</TableHead>
                  <TableHead className="text-right">Diferencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
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
                    <TableRow key={`${productId}-${it.id}`}>
                      <TableCell>{productName}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {Number(it.systemQty) || 0}
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
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
                          className="ml-auto w-24 text-right font-mono h-7"
                        />
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {diff === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : diff === 0 ? (
                          <span className="text-muted-foreground">0</span>
                        ) : diff < 0 ? (
                          <span className="text-rose-600 dark:text-rose-400">{diff}</span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400">+{diff}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleSave}
              disabled={loading || Object.keys(countedQty).length === 0}
            >
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Guardar Conteo</span>
            </Button>
            <Button
              type="button"
              onClick={handleComplete}
              disabled={loading}
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Completar & Ajustar Kardex</span>
            </Button>
          </div>
        </div>
      )}

      {/* Paso 3: Historial */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Historial de Conteos</h2>
          <span className="text-xs text-muted-foreground">{counts.length} registro(s)</span>
        </div>

        {counts.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">No hay conteos registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Conteo</TableHead>
                  <TableHead>Almacén</TableHead>
                  <TableHead>Creado</TableHead>
                  <TableHead className="text-right">Líneas</TableHead>
                  <TableHead className="text-right">Costo Ajustes (USD)</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-center">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
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
                    <TableRow key={c.id}>
                      <TableCell className="font-mono">#{c.id}</TableCell>
                      <TableCell>{whName}</TableCell>
                      <TableCell className="text-muted-foreground text-[11px]">
                        {new Date(c.createdAt).toLocaleString('es-VE')}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {(Array.isArray(c.items) ? c.items : []).length}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatUSD(adjustmentsCost)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={c.status === 'completed' ? 'emerald' : 'amber'} size="sm" dot={c.status === 'in_progress'}>
                          {c.status === 'completed' ? 'Completado' : 'En progreso'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {c.status === 'in_progress' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => setSelectedCountId(c.id)}
                          >
                            Continuar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
