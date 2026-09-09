import React from 'react';
import { notFound } from 'next/navigation';
import {
  getTenantBySlug,
  getAccountsReceivableData,
  getCustomerPaymentsPage,
} from '@/utilities/erpData';
import { paymentsListFiltersSchema } from '@/utilities/erpValidation';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { AccountsReceivableView } from '@/components/erp/AccountsReceivableView';

interface PageProps {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ from?: string; to?: string; method?: string }>;
}

export default async function ReceivablesPage({ params, searchParams }: PageProps) {
  const { tenant: tenantSlug } = await params;
  const sp = await searchParams;
  const filters = paymentsListFiltersSchema.parse(sp);
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

  let data: Awaited<ReturnType<typeof getAccountsReceivableData>>;
  let payments: Awaited<ReturnType<typeof getCustomerPaymentsPage>>;
  try {
    [data, payments] = await Promise.all([
      getAccountsReceivableData(tenant.id),
      getCustomerPaymentsPage(tenant.id, filters),
    ]);
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  return (
    <div className="space-y-6">

      <AccountsReceivableView
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        isVendor={data.isVendor}
        vendors={data.vendors}
        rows={data.rows}
        vendorRows={data.vendorRows}
        summary={data.summary}
        asOf={data.asOf}
        payments={payments}
        paymentFilters={{ from: filters.from, to: filters.to, method: filters.method }}
      />
    </div>
  );
}
