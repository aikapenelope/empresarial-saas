import React from 'react';
import { notFound } from 'next/navigation';
import { getTenantBySlug, getSuppliersPageData } from '@/utilities/erpData';
import { resolveEffectiveRate } from '@/utilities/exchangeRate';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { SuppliersView } from '@/components/erp/SuppliersView';
import type { Supplier, PurchaseInvoice } from '@/payload-types';

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function SuppliersPage({ params }: PageProps) {
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

  let suppliers: Supplier[];
  let purchaseInvoices: PurchaseInvoice[];
  let effectiveRate: number;

  try {
    const [{ suppliers: fetchedSuppliers, openPurchaseInvoices }, rateData] = await Promise.all([
      getSuppliersPageData(tenant.id),
      resolveEffectiveRate(
        tenant.currencyConfig
          ? {
              manualExchangeRate: tenant.currencyConfig.manualExchangeRate ?? undefined,
              autoSyncRate: tenant.currencyConfig.autoSyncRate ?? undefined,
            }
          : undefined,
      ),
    ]);
    suppliers = fetchedSuppliers;
    purchaseInvoices = openPurchaseInvoices;
    effectiveRate = rateData.rate;
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  let totalPayablesUSD = 0;
  for (const pinv of purchaseInvoices) {
    totalPayablesUSD += Number(pinv.balanceUSD) || 0;
  }
  const totalPayablesVES = totalPayablesUSD * effectiveRate;

  return (
    <SuppliersView
      tenantId={tenant.id}
      tenantSlug={tenant.slug}
      suppliers={suppliers}
      purchaseInvoices={purchaseInvoices}
      totalPayablesUSD={totalPayablesUSD}
      totalPayablesVES={totalPayablesVES}
      effectiveRate={effectiveRate}
    />
  );
}
