import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  getTenantBySlug,
  getCustomersWithDebt,
  getProductsCatalog,
  getCashRegistersWithDetails,
  getWarehousesList,
} from '@/utilities/erpData';
import { resolveEffectiveRate } from '@/utilities/exchangeRate';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { POSView } from '@/components/erp/POSView';
import { formatVES } from '@/components/erp/KpiCard';

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function POSPage({ params }: PageProps) {
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

  let products, customers, registers, warehouses, effectiveRate;
  try {
    const [fetchedProducts, fetchedCustomers, fetchedRegisters, fetchedWarehouses, rateData] =
      await Promise.all([
        getProductsCatalog(tenant.id),
        getCustomersWithDebt(tenant.id),
        getCashRegistersWithDetails(tenant.id),
        getWarehousesList(tenant.id),
        resolveEffectiveRate(
          tenant.currencyConfig
            ? {
                manualExchangeRate: tenant.currencyConfig.manualExchangeRate ?? undefined,
                autoSyncRate: tenant.currencyConfig.autoSyncRate ?? undefined,
              }
            : undefined,
        ),
      ]);
    products = fetchedProducts;
    customers = fetchedCustomers;
    registers = fetchedRegisters;
    warehouses = fetchedWarehouses;
    effectiveRate = rateData.rate;
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
              href={`/${tenantSlug}/erp`}
              className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" />
              Dashboard
            </Link>
            <span className="text-slate-600">/</span>
            <span className="text-xs font-semibold text-indigo-400">Punto de Venta</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            Punto de Venta
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 font-mono font-medium">
              Tasa: {formatVES(effectiveRate)}
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Venta de mostrador con recibo automático en el turno de caja y descarga de inventario (Kardex).
          </p>
        </div>
      </div>

      <POSView
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        rate={effectiveRate}
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          priceUSD: Number(p.priceUSD) || 0,
          unitOfMeasure: p.unitOfMeasure,
          priceTiers: p.priceTiers,
        }))}
        customers={customers.map((c) => ({
          id: c.id,
          name: c.name,
          taxId: c.taxId,
          currentDebtUSD: c.currentDebtUSD,
          priceTier: c.priceTier,
        }))}
        registers={registers.map((r) => ({
          id: r.id,
          name: r.name,
          code: r.code,
          currentStatus: r.currentStatus,
        }))}
        warehouses={warehouses.map((w) => ({
          id: w.id,
          name: w.name,
          code: w.code,
          isDefault: w.isDefault,
        }))}
      />
    </div>
  );
}
