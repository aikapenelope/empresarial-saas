import React from 'react';
import { notFound } from 'next/navigation';
import {
  getTenantBySlug,
  getPurchasesPageData,
  getProductsCatalog,
  getWarehousesList,
} from '@/utilities/erpData';
import { resolveEffectiveRate } from '@/utilities/exchangeRate';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { PurchasesView } from '@/components/erp/PurchasesView';

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function PurchasesPage({ params }: PageProps) {
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

  let data, products, warehouses, effectiveRate;
  try {
    const [pageData, fetchedProducts, fetchedWarehouses, rateData] = await Promise.all([
      getPurchasesPageData(tenant.id),
      getProductsCatalog(tenant.id),
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
    data = pageData;
    products = fetchedProducts;
    warehouses = fetchedWarehouses;
    effectiveRate = rateData.rate;
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  return (
    <PurchasesView
      tenantId={tenant.id}
      tenantSlug={tenant.slug}
      data={data}
      effectiveRate={effectiveRate}
      products={products.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        costUSD: Number(p.costUSD) || 0,
        productType: p.productType,
      }))}
      warehouses={warehouses.map((w) => ({
        id: w.id,
        name: w.name,
        code: w.code,
        isDefault: w.isDefault,
      }))}
    />
  );
}
