import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FlaskConical } from 'lucide-react';
import { getTenantBySlug, getProductsCatalog, getBillOfMaterialsList } from '@/utilities/erpData';
import { resolveEffectiveRate } from '@/utilities/exchangeRate';
import { formatUSD, formatVES } from '@/components/erp/KpiCard';
import { Badge } from '@/components/erp/Badge';

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function InventoryPage({ params }: PageProps) {
  const { tenant: tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);

  if (!tenant) {
    notFound();
  }

  const [products, boms, rateData] = await Promise.all([
    getProductsCatalog(tenant.id),
    getBillOfMaterialsList(tenant.id),
    resolveEffectiveRate(
      tenant.currencyConfig
        ? {
            manualExchangeRate: tenant.currencyConfig.manualExchangeRate ?? undefined,
            autoSyncRate: tenant.currencyConfig.autoSyncRate ?? undefined,
          }
        : undefined,
    ),
  ]);

  const effectiveRate = rateData.rate;

  let rawMaterialsCount = 0;
  let manufacturedCount = 0;
  let criticalCount = 0;

  for (const p of products) {
    if (p.productType === 'raw_material') rawMaterialsCount++;
    if (p.productType === 'manufactured') manufacturedCount++;
    const min = Number(p.minStockAlert) || 0;
    const current = Number(p.currentStock) || 0;
    if (min > 0 && current <= min) criticalCount++;
  }

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
          <Link
            href="/admin/collections/products/create"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors shadow-sm"
          >
            + Nuevo Producto
          </Link>
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
            <span className={`text-xl font-bold ${criticalCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {criticalCount}
            </span>
            <span className="text-xs text-slate-400">bajo stock mínimo</span>
          </div>
        </div>
      </div>

      {/* Catálogo de Productos */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden backdrop-blur">
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Catálogo de Artículos & Existencias</h2>
          <span className="text-xs text-slate-400">Precios bimonetarios calculados a tasa oficial</span>
        </div>

        {products.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            No hay productos registrados en este inquilino.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                  <th className="p-3">SKU</th>
                  <th className="p-3">Nombre del Producto / Insumo</th>
                  <th className="p-3">Tipo</th>
                  <th className="p-3 text-right">Costo USD</th>
                  <th className="p-3 text-right">Precio USD</th>
                  <th className="p-3 text-right">Precio VES</th>
                  <th className="p-3 text-right">Stock Actual</th>
                  <th className="p-3 text-center">Estado Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {products.map((p) => {
                  const min = Number(p.minStockAlert) || 0;
                  const current = Number(p.currentStock) || 0;
                  const isCritical = min > 0 && current <= min;
                  const priceUSD = Number(p.priceUSD) || 0;
                  const priceVES = priceUSD * effectiveRate;

                  return (
                    <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3 font-mono text-slate-300 font-medium">{p.sku}</td>
                      <td className="p-3">
                        <div className="font-semibold text-white">{p.name}</div>
                        <div className="text-[11px] text-slate-400">
                          {typeof p.category === 'object' && p.category !== null
                            ? (p.category as { name: string }).name
                            : 'General'}
                        </div>
                      </td>
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
                      <td className="p-3 text-right font-mono text-slate-400">
                        {formatUSD(Number(p.costUSD) || 0)}
                      </td>
                      <td className="p-3 text-right font-mono font-semibold text-white">
                        {formatUSD(priceUSD)}
                      </td>
                      <td className="p-3 text-right font-mono text-emerald-400">
                        {priceUSD > 0 ? formatVES(priceVES) : '—'}
                      </td>
                      <td className="p-3 text-right font-mono font-bold">
                        <span className={isCritical ? 'text-rose-400' : 'text-slate-200'}>
                          {current} {p.unitOfMeasure}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant={isCritical ? 'rose' : 'emerald'} size="sm">
                          {isCritical ? 'Alerta Crítica' : 'Disponible'}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
                    <Badge variant={bom.isActive ? 'emerald' : 'slate'} size="sm">
                      {bom.isActive ? 'Activa' : 'Inactiva'}
                    </Badge>
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
                              {item.quantity} {uom} {Number(item.scrapFactorPercent) > 0 && `(+${item.scrapFactorPercent}% merma)`}
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
    </div>
  );
}
