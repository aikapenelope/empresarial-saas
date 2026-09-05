import React from 'react';
import { notFound } from 'next/navigation';
import {
  getTenantBySlug,
  getCashRegistersWithDetails,
  getWarehousesList,
  getCashClosuresList,
} from '@/utilities/erpData';
import { CashRegistersView } from '@/components/erp/CashRegistersView';

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function CashRegistersPage({ params }: PageProps) {
  const { tenant: tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);

  if (!tenant) {
    notFound();
  }

  const [registers, warehouses, closures] = await Promise.all([
    getCashRegistersWithDetails(tenant.id),
    getWarehousesList(tenant.id),
    getCashClosuresList(tenant.id),
  ]);

  const openCount = registers.filter((r) => r.currentStatus === 'open').length;

  return (
    <CashRegistersView
      tenantId={tenant.id}
      tenantSlug={tenant.slug}
      registers={registers}
      warehouses={warehouses}
      closures={closures}
      openCount={openCount}
    />
  );
}
