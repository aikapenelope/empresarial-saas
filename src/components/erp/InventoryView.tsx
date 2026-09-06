'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Package,
  Search,
  Plus,
  FlaskConical,
  Play,
  Upload,
  ClipboardList,
  ArrowRightLeft,} from 'lucide-react';
import { formatUSD } from './KpiCard';
import { Badge } from './Badge';
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
            <span className="text-xs font-semibold text-indigo-400">Inventario & Producción</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Control de Inventario & Fórmulas BOM
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Gestión multialmacén de materias primas, productos terminados y trazabilidad de recetas de fabricación.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {boms.length > 0 && (
            <button
              onClick={() => handleOpenProduction()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
            >
              <FlaskConical className="h-3.5 w-3.5 text-indigo-400" />
              <span>+ Fabricar Lote (BOM)</span>
            </button>
          )}
          <button
            onClick={() => setIsMovementModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <ArrowRightLeft className="h-3.5 w-3.5 text-indigo-400" />
            <span>Movimiento Manual</span>
          </button>
          <Link
            href={`/${tenantSlug}/erp/inventory/kardex`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <span>Kardex</span>
          </Link>
          <Link
            href={`/${tenantSlug}/erp/inventory/counts`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <ClipboardList className="h-3.5 w-3.5 text-amber-400" />
            <span>Conteos</span>
          </Link>
          <Link
            href={`/${tenantSlug}/erp/inventory/import`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <Upload className="h-3.5 w-3.5 text-emerald-400" />
            <span>Importar Inventario</span>
          </Link>
          <button
            onClick={() => setIsProductModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors shadow-sm shadow-indigo-500/20"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>+ Nuevo Artículo</span>
          </button>
        </div>
      </div>

      {/* Métricas de Inventario */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Total Artículos</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-white">{products.length}</span>
            <span className="text-xs text-slate-400">ítems activos</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Materias Primas</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-amber-400">{rawMaterialsCount}</span>
            <span className="text-xs text-slate-400">insumos base</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Manufacturados (BOM)</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-indigo-400">{manufacturedCount}</span>
            <span className="text-xs text-slate-400">productos con receta</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Stock Crítico</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-rose-400">{lowStockCount}</span>
            <span className="text-xs text-slate-400">bajo mínimo</span>
          </div>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por artículo o SKU..."
            className="w-full rounded-lg border border-slate-800 bg-slate-900/80 pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            onClick={() => setTypeFilter('all')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              typeFilter === 'all'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Todos ({products.length})
          </button>
          <button
            onClick={() => setTypeFilter('raw_material')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              typeFilter === 'raw_material'
                ? 'bg-amber-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Insumos ({rawMaterialsCount})
          </button>
          <button
            onClick={() => setTypeFilter('manufactured')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              typeFilter === 'manufactured'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            BOM / Fabricados ({manufacturedCount})
          </button>
          <button
            onClick={() => setTypeFilter('low_stock')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              typeFilter === 'low_stock'
                ? 'bg-rose-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Alerta Stock ({lowStockCount})
          </button>
        </div>
      </div>

      {/* Tabla de Artículos */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden backdrop-blur">
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Catálogo Maestro de Artículos</h2>
          <span className="text-xs text-slate-400">{filteredProducts.length} ítems mostrados</span>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs space-y-3">
            <Package className="h-8 w-8 mx-auto text-slate-600" />
            <p>No se encontraron artículos registrados con los filtros seleccionados.</p>
            <button
              onClick={() => setIsProductModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              + Registrar Primer Artículo
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                  <th className="p-3">Artículo / Descripción</th>
                  <th className="p-3">SKU</th>
                  <th className="p-3">Tipo</th>
                  <th className="p-3">U.M.</th>
                  <th className="p-3 text-right">Costo CPP (USD)</th>
                  <th className="p-3 text-right">Precio Venta (USD)</th>
                  <th className="p-3 text-right">Existencia Actual</th>
                  <th className="p-3 text-center">Estado Stock</th>
                  <th className="p-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredProducts.map((p) => {
                  const current = Number(p.currentStock) || 0;
                  const min = Number(p.minStockAlert) || 0;
                  const isLow = min > 0 && current <= min;

                  return (
                    <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3">
                        <div className="font-semibold text-white">{p.name}</div>
                        <div className="text-[10px] text-slate-400">
                          {p.productType === 'manufactured' ? 'Producto elaborado con fórmula BOM' : 'Artículo estándar'}
                        </div>
                      </td>
                      <td className="p-3 font-mono text-slate-300 font-medium">{p.sku}</td>
                      <td className="p-3">
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
                      </td>
                      <td className="p-3 uppercase font-mono text-slate-400">{p.unitOfMeasure}</td>
                      <td className="p-3 text-right font-mono text-slate-300">
                        {formatUSD(Number(p.costUSD) || 0)}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-white">
                        {formatUSD(Number(p.priceUSD) || 0)}
                      </td>
                      <td className="p-3 text-right font-mono font-bold">
                        <span className={isLow ? 'text-rose-400' : 'text-emerald-400'}>
                          {current} {p.unitOfMeasure}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant={isLow ? 'rose' : 'emerald'} size="sm">
                          {isLow ? `Bajo Mínimo (${min})` : 'Óptimo'}
                        </Badge>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => setEditingProduct(p)}
                          className="text-indigo-400 hover:text-indigo-300 font-semibold text-[11px]"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reporte de precios VES */}
      <PricingReportCard tenantId={tenantId} />

      {/* Recetas y Fórmulas BOM */}
      {boms.length > 0 && (
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden backdrop-blur space-y-4 p-5">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-white">Fórmulas & Recetas BOM (Bill of Materials)</h2>
            </div>
            <span className="text-xs text-slate-400">{boms.length} recetas configuradas</span>
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
                  className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-xs text-white">{bom.name}</h3>
                      <p className="text-[11px] text-indigo-400">
                        Rinde: {bom.outputQuantity} unidades de {productName}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={bom.isActive ? 'emerald' : 'slate'} size="sm">
                        {bom.isActive ? 'Activa' : 'Inactiva'}
                      </Badge>
                      <button
                        onClick={() => handleOpenProduction(bom.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold transition-colors shadow-sm"
                      >
                        <Play className="h-3 w-3" />
                        <span>Fabricar</span>
                      </button>
                    </div>
                  </div>

                  {bom.instructions && (
                    <p className="text-[11px] text-slate-400 italic bg-slate-900/60 p-2 rounded border border-slate-800/60 leading-relaxed">
                      {bom.instructions}
                    </p>
                  )}

                  <div className="text-[11px] space-y-1">
                    <span className="font-semibold text-slate-300 uppercase tracking-wider text-[10px]">
                      Insumos Requeridos:
                    </span>
                    <ul className="divide-y divide-slate-800/60">
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
                          <li key={idx} className="py-1 flex items-center justify-between text-slate-400">
                            <span>{rawName}</span>
                            <span className="font-mono text-slate-200 font-medium">
                              {item.quantity} {uom}{' '}
                              {Number(item.scrapFactorPercent) > 0 &&
                                `(+${item.scrapFactorPercent}% merma)`}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex justify-between text-[11px] font-mono text-slate-400">
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
