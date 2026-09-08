import React from 'react';
import { notFound } from 'next/navigation';
import {
  getTenantBySlug,
  getCustomersWithDebt,
  getProductsCatalog,
} from '@/utilities/erpData';
import { resolveEffectiveRate } from '@/utilities/exchangeRate';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { ErpPageHeader } from '@/components/erp/ErpPageHeader';
import { QuickQuoteBuilder } from '@/components/erp/QuickQuoteBuilder';

// Sprint 28: sector de cotización rápida — armar con el mínimo de clics y
// enviar por email (Resend) o compartir por WhatsApp inmediatamente.
interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function QuickQuotePage({ params }: PageProps) {
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

  let customers, products, effectiveRateData;
  try {
    [customers, products, effectiveRateData] = await Promise.all([
      getCustomersWithDebt(tenant.id),
      getProductsCatalog(tenant.id),
      resolveEffectiveRate(
        tenant.currencyConfig
          ? {
              manualExchangeRate: tenant.currencyConfig.manualExchangeRate ?? undefined,
              autoSyncRate: tenant.currencyConfig.autoSyncRate ?? undefined,
            }
          : undefined,
      ),
    ]);
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  return (
    <div className="space-y-6">
      <ErpPageHeader
        title="Cotización rápida"
        description="Arma la cotización por SKU y envíala por email o WhatsApp en el mismo paso."
        breadcrumbHref={`/${tenantSlug}/erp/quotes`}
        breadcrumbLabel="Cotizaciones"
        section="Cotización rápida"
      />

      <QuickQuoteBuilder
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        customers={customers.map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          priceTier: c.priceTier,
        }))}
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          priceUSD: Number(p.priceUSD) || 0,
          priceTiers: p.priceTiers,
        }))}
        effectiveRate={effectiveRateData.rate}
      />
    </div>
  );
}
