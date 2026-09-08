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
import { kardexFiltersSchema } from '@/utilities/erpValidation';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { ErpPageHeader } from '@/components/erp/ErpPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KardexTimeline } from '@/components/erp/charts/KardexTimeline';

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

const TYPE_LABELS: Record<string, string> = {
  purchase_in: 'Entrada por Compra',
  sale_out: 'Salida por Venta',
  sale_return: 'Devolución de Venta',
  production_consume: 'Consumo Producción',
  production_output: 'Producto Fabricado',
  transfer: 'Transferencia',
  adjustment_positive: 'Ajuste (+)',
  adjustment_negative: 'Ajuste (−)',
  scrap: 'Merma',
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

  // Filtros validados con Zod: fechas con sintaxis/calendario válidos, page e
  // IDs como enteros positivos. Valores malformados se descartan (catch) en
  // lugar de llegar a getKardexEntries y romper con Invalid Date.
  const q = kardexFiltersSchema.parse(sp);
  const filters = {
    page: q.page,
    productId: q.product,
    warehouseId: q.warehouse,
    movementType: q.movementType,
    from: q.from,
    to: q.to,
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
    const params = new URLSearchParams();
    const merged: Record<string, string | number | undefined> = {
      product: q.product,
      warehouse: q.warehouse,
      type: q.movementType,
      from: q.from,
      to: q.to,
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  };

  const filterSelectClass =
    'w-full rounded-lg border border-input bg-background px-2 py-2 text-foreground text-xs';

  return (
    <div className="space-y-6">
      <ErpPageHeader
        title="Kardex de Inventario"
        description="Ledger inmutable de movimientos: ventas, compras, producción, ajustes, transferencias y conteos."
        breadcrumbHref={`/${tenantSlug}/erp/inventory`}
        breadcrumbLabel="Inventario"
        section="Kardex"
      />

      {/* Filtros (GET — server-side) */}
      <form
        method="get"
        className="rounded-xl border border-border bg-card p-4 grid grid-cols-1 sm:grid-cols-6 gap-3 text-xs"
      >
        <div className="sm:col-span-2">
          <label className="block font-semibold text-foreground mb-1" htmlFor="kardex-product">
            Producto
          </label>
          <select
            id="kardex-product"
            name="product"
            defaultValue={sp.product || ''}
            className={filterSelectClass}
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
          <label className="block font-semibold text-foreground mb-1" htmlFor="kardex-warehouse">
            Almacén
          </label>
          <select
            id="kardex-warehouse"
            name="warehouse"
            defaultValue={sp.warehouse || ''}
            className={filterSelectClass}
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
          <label className="block font-semibold text-foreground mb-1" htmlFor="kardex-type">
            Tipo
          </label>
          <select
            id="kardex-type"
            name="type"
            defaultValue={sp.type || ''}
            className={filterSelectClass}
          >
            <option value="">Todos</option>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-semibold text-foreground mb-1" htmlFor="kardex-from">
            Desde
          </label>
          <Input type="date" id="kardex-from" name="from" defaultValue={sp.from || ''} />
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block font-semibold text-foreground mb-1" htmlFor="kardex-to">
              Hasta
            </label>
            <Input type="date" id="kardex-to" name="to" defaultValue={sp.to || ''} />
          </div>
          <Button type="submit" size="sm">
            Filtrar
          </Button>
        </div>
      </form>

      {/* Ledger como timeline */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Movimientos</h2>
          <span className="text-xs text-muted-foreground">
            {entries.totalDocs} movimiento(s) · página {entries.page} de {entries.totalPages}
          </span>
        </div>

        <div className="p-4">
          <KardexTimeline entries={entries.docs} tenantSlug={tenantSlug} />
        </div>

        {/* Paginación */}
        {entries.totalPages > 1 && (
          <div className="p-3 border-t border-border flex items-center justify-between text-xs">
            {entries.page > 1 ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/${tenantSlug}/erp/inventory/kardex${buildQuery({ page: entries.page - 1 })}`}>
                  ← Anterior
                </Link>
              </Button>
            ) : (
              <span />
            )}
            {entries.page < entries.totalPages ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/${tenantSlug}/erp/inventory/kardex${buildQuery({ page: entries.page + 1 })}`}>
                  Siguiente →
                </Link>
              </Button>
            ) : (
              <span />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
