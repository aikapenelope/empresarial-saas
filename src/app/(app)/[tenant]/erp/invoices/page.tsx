import React from 'react';
import { notFound } from 'next/navigation';
import {
  getTenantBySlug,
  getInvoicesList,
  getCustomersWithDebt,
  getProductsCatalog,
} from '@/utilities/erpData';
import { resolveEffectiveRate } from '@/utilities/exchangeRate';
import { InvoicesView } from '@/components/erp/InvoicesView';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function InvoicesPage({ params }: PageProps) {
  const { tenant: tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);

  if (!tenant) {
    notFound();
  }

  let invoices, customers, products, effectiveRateData;
  try {
    [invoices, customers, products, effectiveRateData] = await Promise.all([
      getInvoicesList(tenant.id),
      getCustomersWithDebt(tenant.id),
      getProductsCatalog(tenant.id),
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

  const sanitizedCustomers = customers.map((c) => ({
    id: c.id,
    name: c.name,
    taxId: c.taxId,
    currentDebtUSD: c.currentDebtUSD,
  }));

  const sanitizedProducts = products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    priceUSD: Number(p.priceUSD) || 0,
    unitOfMeasure: p.unitOfMeasure,
  }));

  return (
    <InvoicesView
      tenantId={tenant.id}
      tenantSlug={tenant.slug}
      invoices={invoices}
      customers={sanitizedCustomers}
      products={sanitizedProducts}
      effectiveRate={effectiveRateData.rate}
    />
  );
}
