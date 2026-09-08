import React from 'react';
import { notFound } from 'next/navigation';
import { getTenantBySlug, getAccountsReceivableData } from '@/utilities/erpData';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { AccountsReceivableView } from '@/components/erp/AccountsReceivableView';

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function ReceivablesPage({ params }: PageProps) {
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

  let data: Awaited<ReturnType<typeof getAccountsReceivableData>>;
  try {
    data = await getAccountsReceivableData(tenant.id);
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
      />
    </div>
  );
}
