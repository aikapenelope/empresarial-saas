import React from 'react';
import { notFound } from 'next/navigation';
import { getTenantBySlug, getRatesPageData } from '@/utilities/erpData';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { RatesView } from '@/components/erp/RatesView';

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function RatesPage({ params }: PageProps) {
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

  let data: Awaited<ReturnType<typeof getRatesPageData>>;
  try {
    data = await getRatesPageData(tenant.id);
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  return (
    <div className="space-y-6">

      <RatesView
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        tenantName={tenant.name}
        currencyConfig={tenant.currencyConfig ?? null}
        data={data}
      />
    </div>
  );
}
