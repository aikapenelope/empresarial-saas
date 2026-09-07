import React from 'react';
import { notFound } from 'next/navigation';
import {
  getTenantBySlug,
  getCashRegistersWithDetails,
  getWarehousesList,
  getCashClosuresList,
} from '@/utilities/erpData';
import { resolveEffectiveRate } from '@/utilities/exchangeRate';
import { CashRegistersView } from '@/components/erp/CashRegistersView';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function CashRegistersPage({ params }: PageProps) {
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

  let registers, warehouses, closures, effectiveRate: number;
  try {
    [registers, warehouses, closures, effectiveRate] = await Promise.all([
      getCashRegistersWithDetails(tenant.id),
      getWarehousesList(tenant.id),
      getCashClosuresList(tenant.id),
      resolveEffectiveRate(
        tenant.currencyConfig
          ? {
              manualExchangeRate: tenant.currencyConfig.manualExchangeRate ?? undefined,
              autoSyncRate: tenant.currencyConfig.autoSyncRate ?? undefined,
            }
          : undefined,
      ).then((r) => r.rate),
    ]);
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  const openCount = registers.filter((r) => r.currentStatus === 'open').length;

  return (
    <CashRegistersView
      tenantId={tenant.id}
      tenantSlug={tenant.slug}
      registers={registers}
      warehouses={warehouses}
      closures={closures}
      openCount={openCount}
      effectiveRate={effectiveRate}
    />
  );
}
