import React from 'react';
import { notFound } from 'next/navigation';
import {
  getTenantBySlug,
  getQuotesPage,
  getQuotesTotals,
  getCustomersWithDebt,
  getProductsCatalog,
  getCashRegistersWithDetails,
  getWarehousesList,
} from '@/utilities/erpData';
import { resolveEffectiveRate } from '@/utilities/exchangeRate';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { QuotesView } from '@/components/erp/QuotesView';
import { quotesListFiltersSchema } from '@/utilities/erpValidation';


interface PageProps {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ from?: string; to?: string; status?: string; origin?: string; page?: string }>;
}

export default async function QuotesPage({ params, searchParams }: PageProps) {
  const { tenant: tenantSlug } = await params;
  const sp = await searchParams;
  const filters = quotesListFiltersSchema.parse(sp);
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

  let quotes, quotesTotals, customers, products, registers, warehouses, effectiveRateData;
  try {
    [quotes, quotesTotals, customers, products, registers, warehouses, effectiveRateData] = await Promise.all([
      getQuotesPage(tenant.id, filters),
      getQuotesTotals(tenant.id, filters),
      getCustomersWithDebt(tenant.id),
      getProductsCatalog(tenant.id),
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
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  return (
    <div className="space-y-6">

      <QuotesView
        filters={{ from: filters.from, to: filters.to, status: filters.status, origin: filters.origin }}
        pagination={{ page: quotes.page, totalPages: quotes.totalPages, totalDocs: quotes.totalDocs }}
        totals={quotesTotals}
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        quotes={quotes.docs}
        customers={customers.map((c) => ({
          id: c.id,
          name: c.name,
          taxId: c.taxId,
          phone: c.phone,
          priceTier: c.priceTier,
        }))}
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          priceUSD: Number(p.priceUSD) || 0,
          priceTiers: p.priceTiers,
        }))}
        cashRegisters={registers.map((r) => ({
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
        effectiveRate={effectiveRateData.rate}
      />
    </div>
  );
}
