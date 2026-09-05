import React from 'react';
import { notFound } from 'next/navigation';
import { getPayload } from 'payload';
import config from '@payload-config';
import { getTenantBySlug } from '@/utilities/erpData';
import { resolveEffectiveRate } from '@/utilities/exchangeRate';
import { SuppliersView } from '@/components/erp/SuppliersView';
import type { Supplier, PurchaseInvoice } from '@/payload-types';

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function SuppliersPage({ params }: PageProps) {
  const { tenant: tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);

  if (!tenant) {
    notFound();
  }

  const payload = await getPayload({ config });

  const [suppliersRes, purchaseInvoicesRes, rateData] = await Promise.all([
    payload.find({
      collection: 'suppliers',
      where: { tenant: { equals: tenant.id } },
      limit: 100,
      depth: 0,
      sort: '-currentDebtUSD',
    }),
    payload.find({
      collection: 'purchase-invoices',
      where: {
        and: [
          { tenant: { equals: tenant.id } },
          { status: { not_equals: 'paid' } },
        ],
      },
      limit: 50,
      depth: 1,
      sort: 'dueDate',
    }),
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
  const suppliers = suppliersRes.docs as Supplier[];
  const purchaseInvoices = purchaseInvoicesRes.docs as PurchaseInvoice[];

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
