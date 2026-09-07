import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import {
  getTenantBySlug,
  getCustomersWithDebt,
  getProductsCatalog,
} from '@/utilities/erpData';
import { resolveEffectiveRate } from '@/utilities/exchangeRate';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/${tenantSlug}/erp/quotes`}
              className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" />
              Cotizaciones
            </Link>
            <span className="text-slate-600">/</span>
            <span className="text-xs font-semibold text-indigo-400">Cotización rápida</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Cotización rápida</h1>
          <p className="text-xs text-slate-400 mt-1">
            Arma la cotización por SKU y envíala por email o WhatsApp en el mismo paso.
          </p>
        </div>
      </div>

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
