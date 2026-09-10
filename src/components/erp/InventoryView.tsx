'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Package,
  Search,
  Plus,
  FlaskConical,
  Play,
  Upload,
  ClipboardList,
  ArrowRightLeft,
  Boxes,
  Wheat,
  Factory,
  TriangleAlert,
} from 'lucide-react';
import { EmptyState } from './EmptyState';
import { formatUSD } from './format';
import { Badge } from './Badge';
import { KpiCard } from './KpiCard';
import { ErpPageHeader } from './ErpPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ProductModal } from './modals/ProductModal';
import { StockMovementModal } from './modals/StockMovementModal';
import { PricingReportCard } from './PricingReportCard';
import { ProductionModal } from './modals/ProductionModal';
import type { Product, BillOfMaterial, Warehouse } from '@/payload-types';

interface InventoryViewProps {
  tenantId: number;
  tenantSlug: string;
  products: Product[];
  boms: BillOfMaterial[];
  warehouses: Warehouse[];
  rawMaterialsCount: number;
  manufacturedCount: number;
  lowStockCount: number;
}

const TYPE_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'raw_material', label: 'Insumos' },
  { value: 'manufactured', label: 'BOM / Fabricados' },
  { value: 'low_stock', label: 'Alerta Stock' },
] as const;

export function InventoryView({
  tenantId,
  tenantSlug,
  products,
  boms,
  warehouses,
  rawMaterialsCount,
  manufacturedCount,
  lowStockCount,
}: InventoryViewProps) {
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>(undefined);
  const [isProductionModalOpen, setIsProductionModalOpen] = useState(false);
  const [selectedBomId, setSelectedBomId] = useState<number | undefined>(undefined);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'raw_material' | 'manufactured' | 'standard' | 'low_stock'>('all');

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase());

    if (typeFilter === 'all') return matchesSearch;
    if (typeFilter === 'low_stock') {
      const min = Number(p.minStockAlert) || 0;
      const current = Number(p.currentStock) || 0;
      return matchesSearch && min > 0 && current <= min;
    }
    return matchesSearch && p.productType === typeFilter;
  });

  const handleOpenProduction = (bomId?: number) => {
    setSelectedBomId(bomId || boms[0]?.id);
    setIsProductionModalOpen(true);
  };

  const sanitizedWarehouses = warehouses
    .filter((w) => w.isActive !== false)
    .map((w) => ({
      id: w.id,
      name: w.name,
      code: w.code,
    }));

  return (
    <div className="space-y-6">
      <ErpPageHeader
        title="Control de Inventario & Fórmulas BOM"
        description="Gestión multialmacén de materias primas, productos terminados y trazabilidad de recetas de fabricación."
        breadcrumbHref={`/${tenantSlug}/erp`}
        section="Inventario & Producción"
        actions={
          <>
            {boms.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => handleOpenProduction()}>
                <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
                Fabricar Lote (BOM)
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setIsMovementModalOpen(true)}>
              <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Movimiento Manual
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/${tenantSlug}/erp/inventory/kardex`}>Kardex</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/${tenantSlug}/erp/inventory/counts`}>
                <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
                Conteos
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/${tenantSlug}/erp/inventory/import`}>
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                Importar
              </Link>
            </Button>
            <Button size="sm" onClick={() => setIsProductModalOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Nuevo Artículo
            </Button>
          </>
        }
      />

      {/* Métricas de Inventario */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Artículos"
          valueUSD={String(products.length)}
          icon={Boxes}
          description="Ítems activos"
        />
        <KpiCard
          title="Materias Primas"
          valueUSD={String(rawMaterialsCount)}
          icon={Wheat}
          tone="warning"
          description="Insumos base"
        />
        <KpiCard
          title="Manufacturados (BOM)"
          valueUSD={String(manufacturedCount)}
          icon={Factory}
          description="Productos con receta"
        />
        <KpiCard
          title="Stock Crítico"
          valueUSD={String(lowStockCount)}
          icon={TriangleAlert}
          tone="destructive"
          description="Bajo mínimo"
        />
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por artículo o SKU..."
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {TYPE_FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={typeFilter === f.value ? 'default' : 'outline'}
              onClick={() => setTypeFilter(f.value)}
            >
              {f.value === 'all'
                ? `${f.label} (${products.length})`
                : f.value === 'raw_material'
                  ? `${f.label} (${rawMaterialsCount})`
                  : f.value === 'manufactured'
                    ? `${f.label} (${manufacturedCount})`
                    : `${f.label} (${lowStockCount})`}
            </Button>
          ))}
        </div>
      </div>

      {/* Tabla de Artículos */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Catálogo Maestro de Artículos</h2>
          <span className="text-xs text-muted-foreground">{filteredProducts.length} ítems mostrados</span>
        </div>

        {filteredProducts.length === 0 ? (
          <EmptyState icon={Package} title="Sin artículos con los filtros actuales." description="Ajusta los filtros o registra el primer artículo del catálogo.">
            <Button size="sm" onClick={() => setIsProductModalOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Registrar Primer Artículo
            </Button>
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Artículo / Descripción</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>U.M.</TableHead>
                  <TableHead className="text-right">Costo CPP (USD)</TableHead>
                  <TableHead className="text-right">Precio Venta (USD)</TableHead>
                  <TableHead className="text-right">Existencia Actual</TableHead>
                  <TableHead className="text-center">Estado Stock</TableHead>
                  <TableHead className="text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((p) => {
                  const current = Number(p.currentStock) || 0;
                  const min = Number(p.minStockAlert) || 0;
                  const isLow = min > 0 && current <= min;
                  // Cobertura visual contra el mínimo: 100% = exactamente el mínimo;
                  // de ahí en adelante la barra se llena con excedente (cap 3x).
                  const coveragePct =
                    min > 0 ? Math.min(100, (current / min) * 100) : 100;

                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-semibold text-foreground">{p.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {p.productType === 'manufactured' ? 'Producto elaborado con fórmula BOM' : 'Artículo estándar'}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono font-medium text-muted-foreground">{p.sku}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            p.productType === 'raw_material'
                              ? 'amber'
                              : p.productType === 'manufactured'
                                ? 'indigo'
                                : 'slate'
                          }
                          size="sm"
                        >
                          {p.productType === 'raw_material'
                            ? 'Materia Prima'
                            : p.productType === 'manufactured'
                              ? 'Manufacturado'
                              : 'Estándar'}
                        </Badge>
                      </TableCell>
                      <TableCell className="uppercase font-mono text-muted-foreground">{p.unitOfMeasure}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {formatUSD(Number(p.costUSD) || 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold">
                        {formatUSD(Number(p.priceUSD) || 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold">
                        <span className={isLow ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}>
                          {current} {p.unitOfMeasure}
                        </span>
                        {min > 0 && (
                          <Progress
                            value={coveragePct}
                            className={`mt-1.5 h-1 ${isLow ? '[&>div]:bg-rose-500' : '[&>div]:bg-emerald-500'}`}
                            aria-label={`Cobertura de stock de ${p.name}: ${coveragePct.toFixed(0)}% del mínimo`}
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={isLow ? 'rose' : 'emerald'} size="sm" dot>
                          {isLow ? `Bajo Mínimo (${min})` : 'Óptimo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => setEditingProduct(p)}
                        >
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Reporte de precios VES */}
      <PricingReportCard tenantId={tenantId} />

      {/* Recetas y Fórmulas BOM */}
      {boms.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden space-y-4 p-5">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-foreground">Fórmulas & Recetas BOM (Bill of Materials)</h2>
            </div>
            <span className="text-xs text-muted-foreground">{boms.length} recetas configuradas</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {boms.map((bom) => {
              const productName =
                typeof bom.product === 'object' && bom.product !== null
                  ? (bom.product as { name: string }).name
                  : 'Producto Terminado';

              return (
                <div
                  key={bom.id}
                  className="rounded-lg border border-border bg-muted/30 p-4 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-xs text-foreground">{bom.name}</h3>
                      <p className="text-[11px] text-muted-foreground">
                        Rinde: {bom.outputQuantity} unidades de {productName}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={bom.isActive ? 'emerald' : 'slate'} size="sm" dot={bom.isActive === true}>
                        {bom.isActive ? 'Activa' : 'Inactiva'}
                      </Badge>
                      <Button size="sm" className="h-7 px-2.5 text-[11px]" onClick={() => handleOpenProduction(bom.id)}>
                        <Play className="h-3 w-3" aria-hidden="true" />
                        Fabricar
                      </Button>
                    </div>
                  </div>

                  {bom.instructions && (
                    <p className="text-[11px] text-muted-foreground italic bg-muted/50 p-2 rounded border border-border leading-relaxed">
                      {bom.instructions}
                    </p>
                  )}

                  <div className="text-[11px] space-y-1">
                    <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                      Insumos Requeridos:
                    </span>
                    <ul className="divide-y divide-border">
                      {bom.items?.map((item, idx) => {
                        const rawName =
                          typeof item.rawMaterial === 'object' && item.rawMaterial !== null
                            ? (item.rawMaterial as { name: string; unitOfMeasure?: string }).name
                            : 'Insumo';
                        const uom =
                          typeof item.rawMaterial === 'object' && item.rawMaterial !== null
                            ? (item.rawMaterial as { unitOfMeasure?: string }).unitOfMeasure || ''
                            : '';

                        return (
                          <li key={idx} className="py-1 flex items-center justify-between text-muted-foreground">
                            <span>{rawName}</span>
                            <span className="font-mono text-foreground font-medium">
                              {item.quantity} {uom}{' '}
                              {Number(item.scrapFactorPercent) > 0 &&
                                `(+${item.scrapFactorPercent}% merma)`}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  <div className="pt-2 border-t border-border flex justify-between text-[11px] font-mono text-muted-foreground">
                    <span>Mano de Obra: {formatUSD(Number(bom.laborCostUSD) || 0)}</span>
                    <span>Costos Indirectos: {formatUSD(Number(bom.indirectCostsUSD) || 0)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal Movimiento Manual */}
      <StockMovementModal
        isOpen={isMovementModalOpen}
        onClose={() => setIsMovementModalOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        products={products.map((p) => ({ id: p.id, name: p.name, sku: p.sku }))}
        warehouses={warehouses
          .filter((w) => w.isActive !== false)
          .map((w) => ({ id: w.id, name: w.name, code: w.code, isDefault: w.isDefault }))}
      />

      {/* Modal Nuevo/Editar Artículo */}
      <ProductModal
        isOpen={isProductModalOpen || Boolean(editingProduct)}
        onClose={() => {
          setIsProductModalOpen(false);
          setEditingProduct(undefined);
        }}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        initial={editingProduct}
      />

      {/* Modal Fabricar BOM */}
      <ProductionModal
        isOpen={isProductionModalOpen}
        onClose={() => setIsProductionModalOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        boms={boms.map((b) => ({
          id: b.id,
          name: b.name,
          outputQuantity: b.outputQuantity,
          product: b.product,
          items: b.items?.map((it) => ({
            rawMaterial: it.rawMaterial,
            quantity: it.quantity,
          })),
        }))}
        warehouses={sanitizedWarehouses}
        defaultBomId={selectedBomId}
      />
    </div>
  );
}
