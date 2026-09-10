import React from 'react';
import { notFound } from 'next/navigation';
import {
  getTenantBySlug,
  getCustomersWithDebt,
  getProductsCatalog,
  getCashRegistersWithDetails,
  getWarehousesList,
} from '@/utilities/erpData';
import { resolveEffectiveRate } from '@/utilities/exchangeRate';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { ErpPageHeader } from '@/components/erp/ErpPageHeader';
import { POSView } from '@/components/erp/POSView';
import { formatVES } from '@/components/erp/format';

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function POSPage({ params }: PageProps) {
  const { tenant: tenantSlug } = await params;
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

  let products, customers, registers, warehouses, effectiveRate;
  try {
    const [fetchedProducts, fetchedCustomers, fetchedRegisters, fetchedWarehouses, rateData] =
      await Promise.all([
        getProductsCatalog(tenant.id),
        getCustomersWithDebt(tenant.id),
        getCashRegistersWithDetails(tenant.id),
        getWarehousesList(tenant.id),
        resolveEffectiveRate(
          tenant.currencyConfig
            ? {
                manualExchangeRate: tenant.currencyConfig.manualExchangeRate ?? undefined,
                autoSyncRate: tenant.currencyConfig.autoSyncRate ?? undefined,
              }
            : undefined,
        ),
      ]);
    products = fetchedProducts;
    customers = fetchedCustomers;
    registers = fetchedRegisters;
    warehouses = fetchedWarehouses;
    effectiveRate = rateData.rate;
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  return (
    <div className="space-y-6">
      <ErpPageHeader
        title="Punto de Venta"
        description="Venta de mostrador con recibo automático en el turno de caja y descarga de inventario (Kardex)."
        breadcrumbHref={`/${tenantSlug}/erp`}
        section="Punto de Venta"
        badge={
          <span className="text-xs px-2 py-0.5 rounded-full border border-border bg-muted text-foreground font-mono font-medium">
            Tasa: {formatVES(effectiveRate)}
          </span>
        }
      />

      <POSView
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        rate={effectiveRate}
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          barcode: p.barcode,
          priceUSD: Number(p.priceUSD) || 0,
          unitOfMeasure: p.unitOfMeasure,
          priceTiers: p.priceTiers,
        }))}
        customers={customers.map((c) => ({
          id: c.id,
          name: c.name,
          taxId: c.taxId,
          currentDebtUSD: c.currentDebtUSD,
          priceTier: c.priceTier,
        }))}
        registers={registers.map((r) => ({
          id: r.id,
          name: r.name,
          code: r.code,
          currentStatus: r.currentStatus,
        }))}
        warehouses={warehouses.map((w) => ({
          id: w.id,
          name: w.name,
          code: w.code,
          isDefault: w.isDefault,
        }))}
      />
    </div>
  );
}
