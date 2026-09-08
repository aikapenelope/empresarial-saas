import React from 'react';
import { notFound } from 'next/navigation';
import {
  getTenantBySlug,
  getWarehousesList,
  getInventoryCountsList,
} from '@/utilities/erpData';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { CountsView } from '@/components/erp/CountsView';
import type { InventoryCount } from '@/payload-types';

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function InventoryCountsPage({ params }: PageProps) {
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

  let counts: InventoryCount[];
  let warehouses: Awaited<ReturnType<typeof getWarehousesList>>;
  try {
    [counts, warehouses] = await Promise.all([
      getInventoryCountsList(tenant.id),
      getWarehousesList(tenant.id),
    ]);
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  return (
    <div className="space-y-6">

      <CountsView
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        counts={counts}
        warehouses={warehouses.map((w) => ({ id: w.id, name: w.name, code: w.code }))}
      />
    </div>
  );
}
