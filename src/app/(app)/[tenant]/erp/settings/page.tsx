import React from 'react';
import { notFound } from 'next/navigation';
import { getTenantBySlug } from '@/utilities/erpData';
import { getLiveExchangeRates, resolveEffectiveRate } from '@/utilities/exchangeRate';
import { requireErpTenantAccess, ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { SettingsView } from '@/components/erp/SettingsView';

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function SettingsPage({ params }: PageProps) {
  const { tenant: tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);

  if (!tenant) {
    notFound();
  }

  try {
    await requireErpTenantAccess(tenant.id);
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  const [liveRates, effectiveRateData] = await Promise.all([
    getLiveExchangeRates(),
    resolveEffectiveRate(
      tenant.currencyConfig
        ? {
            manualExchangeRate: tenant.currencyConfig.manualExchangeRate ?? undefined,
            autoSyncRate: tenant.currencyConfig.autoSyncRate ?? undefined,
          }
        : undefined,
    ),
  ]);

  return (
    <SettingsView
      tenant={tenant}
      effectiveRate={effectiveRateData.rate}
      bcvRate={liveRates.bcv}
      rateSource={effectiveRateData.source}
    />
  );
}
