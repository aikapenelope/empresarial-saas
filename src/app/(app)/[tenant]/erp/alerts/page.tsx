import React from 'react';
import { notFound } from 'next/navigation';
import { getTenantBySlug, getAlertsPageData } from '@/utilities/erpData';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { AlertsView } from '@/components/erp/AlertsView';

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function AlertsPage({ params }: PageProps) {
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

  let data: Awaited<ReturnType<typeof getAlertsPageData>>;
  try {
    data = await getAlertsPageData(tenant.id);
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  return (
    <div className="space-y-6">

      <AlertsView
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        active={data.active}
        resolved={data.resolved}
        counts={data.counts}
      />
    </div>
  );
}
