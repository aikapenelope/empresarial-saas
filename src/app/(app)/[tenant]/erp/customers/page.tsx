import React from 'react';
import { notFound } from 'next/navigation';
import { getTenantBySlug, getCustomersWithDebt } from '@/utilities/erpData';
import { resolveEffectiveRate } from '@/utilities/exchangeRate';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { CustomersView } from '@/components/erp/CustomersView';

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function CustomersPage({ params }: PageProps) {
  const { tenant: tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);

  if (!tenant) {
    notFound();
  }

  let customers: Awaited<ReturnType<typeof getCustomersWithDebt>>;
  let effectiveRate: number;

  try {
    const [fetchedCustomers, rateData] = await Promise.all([
      getCustomersWithDebt(tenant.id),
      resolveEffectiveRate(
        tenant.currencyConfig
          ? {
              manualExchangeRate: tenant.currencyConfig.manualExchangeRate ?? undefined,
              autoSyncRate: tenant.currencyConfig.autoSyncRate ?? undefined,
            }
          : undefined,
      ),
    ]);
    customers = fetchedCustomers;
    effectiveRate = rateData.rate;
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  let totalDebtUSD = 0;
  let overdueDebtUSD = 0;
  let debtorsCount = 0;
  let overdueDebtorsCount = 0;

  for (const c of customers) {
    const debt = Number(c.currentDebtUSD) || 0;
    const overdue = Number(c.overdueDebtUSD) || 0;
    totalDebtUSD += debt;
    overdueDebtUSD += overdue;
    if (debt > 0) debtorsCount++;
    if (overdue > 0) overdueDebtorsCount++;
  }

  const totalDebtVES = totalDebtUSD * effectiveRate;

  return (
    <CustomersView
      tenantId={tenant.id}
      tenantSlug={tenant.slug}
      customers={customers}
      totalDebtUSD={totalDebtUSD}
      totalDebtVES={totalDebtVES}
      overdueDebtUSD={overdueDebtUSD}
      debtorsCount={debtorsCount}
      overdueDebtorsCount={overdueDebtorsCount}
      effectiveRate={effectiveRate}
    />
  );
}
