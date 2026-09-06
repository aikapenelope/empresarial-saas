import React from 'react';
import { notFound } from 'next/navigation';
import { getTenantBySlug, getVendorsPageData } from '@/utilities/erpData';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { VendorsView } from '@/components/erp/VendorsView';

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function VendorsPage({ params }: PageProps) {
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

  let data;
  try {
    data = await getVendorsPageData(tenant.id);
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  return <VendorsView tenantId={tenant.id} tenantSlug={tenant.slug} data={data} />;
}
