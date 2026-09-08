import React from 'react';
import { notFound } from 'next/navigation';
import {
  getTenantBySlug,
  getQuotesList,
  getCustomersWithDebt,
  getProductsCatalog,
  getCashRegistersWithDetails,
  getWarehousesList,
} from '@/utilities/erpData';
import { resolveEffectiveRate } from '@/utilities/exchangeRate';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { QuotesView } from '@/components/erp/QuotesView';

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function QuotesPage({ params }: PageProps) {
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

  let quotes, customers, products, registers, warehouses, effectiveRateData;
  try {
    [quotes, customers, products, registers, warehouses, effectiveRateData] = await Promise.all([
      getQuotesList(tenant.id),
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
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        quotes={quotes}
        customers={customers.map((c) => ({
          id: c.id,
          name: c.name,
          taxId: c.taxId,
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
