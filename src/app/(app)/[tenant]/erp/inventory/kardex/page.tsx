import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getTenantBySlug,
  getKardexEntries,
  getProductsCatalog,
  getWarehousesList,
} from '@/utilities/erpData';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { formatUSD } from '@/components/erp/KpiCard';
import { Badge } from '@/components/erp/Badge';

interface PageProps {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{
    page?: string;
    product?: string;
    warehouse?: string;
    type?: string;
    from?: string;
    to?: string;
  }>;
}

const TYPE_LABELS: Record<string, { label: string; variant: 'slate' | 'emerald' | 'rose' | 'amber' | 'indigo' }> = {
  purchase_in: { label: 'Entrada por Compra', variant: 'emerald' },
  sale_out: { label: 'Salida por Venta', variant: 'rose' },
  sale_return: { label: 'Devolución de Venta', variant: 'emerald' },
  production_consume: { label: 'Consumo Producción', variant: 'amber' },
  production_output: { label: 'Producto Fabricado', variant: 'emerald' },
  transfer: { label: 'Transferencia', variant: 'indigo' },
  adjustment_positive: { label: 'Ajuste (+)', variant: 'emerald' },
  adjustment_negative: { label: 'Ajuste (−)', variant: 'rose' },
  scrap: { label: 'Merma', variant: 'rose' },
};

export default async function KardexPage({ params, searchParams }: PageProps) {
  const { tenant: tenantSlug } = await params;
  const sp = await searchParams;

  let tenant: Awaited<ReturnType<typeof getTenantBySlug>> = null;
  try {
    tenant = await getTenantBySlug(tenantSlug);
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  if (!tenant) {
    notFound();
  }

  const filters = {
    page: sp.page ? Number(sp.page) : 1,
    productId: sp.product ? Number(sp.product) : undefined,
    warehouseId: sp.warehouse ? Number(sp.warehouse) : undefined,
    movementType: sp.type || undefined,
    from: sp.from || undefined,
    to: sp.to || undefined,
  };

  let entries, products, warehouses;
  try {
    [entries, products, warehouses] = await Promise.all([
      getKardexEntries(tenant.id, filters),
      getProductsCatalog(tenant.id),
      getWarehousesList(tenant.id),
    ]);
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  const buildQuery = (overrides: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    const merged: Record<string, string | number | undefined> = {
      product: sp.product,
      warehouse: sp.warehouse,
      type: sp.type,
      from: sp.from,
      to: sp.to,
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v !== undefined && v !== '') q.set(k, String(v));
    }
    const qs = q.toString();
    return qs ? `?${qs}` : '';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/${tenantSlug}/erp/inventory`}
              className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1"
            >
              ← Inventario
            </Link>
            <span className="text-slate-600">/</span>
            <span className="text-xs font-semibold text-indigo-400">Kardex</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Kardex de Inventario</h1>
          <p className="text-xs text-slate-400 mt-1">
            Ledger inmutable de movimientos: ventas, compras, producción, ajustes, transferencias y conteos.
          </p>
        </div>
      </div>

      {/* Filtros (GET — server-side) */}
      <form
        method="get"
        className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4 grid grid-cols-1 sm:grid-cols-6 gap-3 text-xs"
      >
        <div className="sm:col-span-2">
          <label className="block font-semibold text-slate-300 mb-1">Producto</label>
          <select
            name="product"
            defaultValue={sp.product || ''}
            className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-2 text-white"
          >
            <option value="">Todos</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.sku})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-semibold text-slate-300 mb-1">Almacén</label>
          <select
            name="warehouse"
            defaultValue={sp.warehouse || ''}
            className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-2 text-white"
          >
            <option value="">Todos</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-semibold text-slate-300 mb-1">Tipo</label>
          <select
            name="type"
            defaultValue={sp.type || ''}
            className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-2 text-white"
          >
            <option value="">Todos</option>
            {Object.entries(TYPE_LABELS).map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-semibold text-slate-300 mb-1">Desde</label>
          <input
            type="date"
            name="from"
            defaultValue={sp.from || ''}
            className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-2 text-white"
          />
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block font-semibold text-slate-300 mb-1">Hasta</label>
            <input
              type="date"
              name="to"
              defaultValue={sp.to || ''}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-2 text-white"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
          >
            Filtrar
          </button>
        </div>
      </form>

      {/* Ledger */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden backdrop-blur">
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Movimientos</h2>
          <span className="text-xs text-slate-400">
            {entries.totalDocs} movimiento(s) · página {entries.page} de {entries.totalPages}
          </span>
        </div>

        {entries.docs.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-10">
            No hay movimientos con esos filtros.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Referencia</th>
                  <th className="p-3">Tipo</th>
                  <th className="p-3">Producto</th>
                  <th className="p-3">Origen</th>
                  <th className="p-3">Destino</th>
                  <th className="p-3 text-right">Cant.</th>
                  <th className="p-3 text-right">Costo (USD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {entries.docs.map((m) => {
                  const typeInfo = TYPE_LABELS[m.movementType] || { label: m.movementType, variant: 'slate' as const };
                  const productName =
                    typeof m.product === 'object' && m.product !== null ? m.product.name : `#${m.product}`;
                  const sourceName =
                    typeof m.sourceWarehouse === 'object' && m.sourceWarehouse !== null
                      ? m.sourceWarehouse.name
                      : '—';
                  const targetName =
                    typeof m.targetWarehouse === 'object' && m.targetWarehouse !== null
                      ? m.targetWarehouse.name
                      : '—';
                  const invoiceId =
                    typeof m.invoice === 'object' && m.invoice !== null ? m.invoice.id : m.invoice;
                  return (
                    <tr key={m.id} className="hover:bg-slate-800/30">
                      <td className="p-3 text-slate-400 text-[11px]">
                        {new Date(m.createdAt).toLocaleDateString('es-VE')}
                      </td>
                      <td className="p-3 font-mono text-[11px]">
                        {invoiceId ? (
                          <Link
                            href={`/${tenantSlug}/erp/invoices/${invoiceId}`}
                            className="text-indigo-400 hover:text-indigo-300 underline decoration-slate-700 underline-offset-2"
                          >
                            {m.reference}
                          </Link>
                        ) : (
                          <span className="text-slate-300">{m.reference}</span>
                        )}
                      </td>
                      <td className="p-3">
                        <Badge variant={typeInfo.variant} size="sm">
                          {typeInfo.label}
                        </Badge>
                      </td>
                      <td className="p-3 text-white">{productName}</td>
                      <td className="p-3 text-slate-400">{sourceName}</td>
                      <td className="p-3 text-slate-400">{targetName}</td>
                      <td className="p-3 text-right font-mono font-bold text-slate-200">{m.quantity}</td>
                      <td className="p-3 text-right font-mono text-slate-400">
                        {formatUSD(Number(m.totalCostUSD) || 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {entries.totalPages > 1 && (
          <div className="p-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
            {entries.page > 1 ? (
              <Link
                href={`/${tenantSlug}/erp/inventory/kardex${buildQuery({ page: entries.page - 1 })}`}
                className="text-indigo-400 hover:text-indigo-300 font-semibold"
              >
                ← Anterior
              </Link>
            ) : (
              <span />
            )}
            {entries.page < entries.totalPages ? (
              <Link
                href={`/${tenantSlug}/erp/inventory/kardex${buildQuery({ page: entries.page + 1 })}`}
                className="text-indigo-400 hover:text-indigo-300 font-semibold"
              >
                Siguiente →
              </Link>
            ) : (
              <span />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
