import React from 'react';
import { notFound } from 'next/navigation';
import {
  getTenantBySlug,
  getPurchasesPageData,
  getPurchasesPage,
  getProductsCatalog,
  getWarehousesList,
} from '@/utilities/erpData';
import { resolveEffectiveRate } from '@/utilities/exchangeRate';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { PurchasesView } from '@/components/erp/PurchasesView';
import { purchasesListFiltersSchema } from '@/utilities/erpValidation';

interface PageProps {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ from?: string; to?: string; status?: string; page?: string }>;
}

export default async function PurchasesPage({ params, searchParams }: PageProps) {
  const { tenant: tenantSlug } = await params;
  const sp = await searchParams;
  const filters = purchasesListFiltersSchema.parse(sp);
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

  let data, invoicesPage, products, warehouses, effectiveRate;
  try {
    const [pageData, invoicePageData, fetchedProducts, fetchedWarehouses, rateData] = await Promise.all([
      getPurchasesPageData(tenant.id),
      getPurchasesPage(tenant.id, filters),
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
    invoicesPage = invoicePageData;
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
      invoicePage={invoicesPage}
      filters={{ from: filters.from, to: filters.to, status: filters.status }}
      pagination={{ page: invoicesPage.page, totalPages: invoicesPage.totalPages, totalDocs: invoicesPage.totalDocs }}
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
