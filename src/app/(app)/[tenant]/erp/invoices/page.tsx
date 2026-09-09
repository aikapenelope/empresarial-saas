import React from 'react';
import { notFound } from 'next/navigation';
import {
  getTenantBySlug,
  getInvoicesPage,
  getInvoicesTotals,
  getOpenInvoicesForPayments,
  getCustomersWithDebt,
  getProductsCatalog,
  getCashRegistersWithDetails,
  getWarehousesList,
} from '@/utilities/erpData';
import { resolveEffectiveRate } from '@/utilities/exchangeRate';
import { invoicesListFiltersSchema } from '@/utilities/erpValidation';
import { InvoicesView } from '@/components/erp/InvoicesView';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';

interface PageProps {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ page?: string; from?: string; to?: string; status?: string }>;
}

export default async function InvoicesPage({ params, searchParams }: PageProps) {
  const { tenant: tenantSlug } = await params;
  const sp = await searchParams;

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

  // Filtros validados con Zod: fechas de calendario, page positiva y status del
  // enum propio. Valores malformados se descartan (catch) — patrón del kardex.
  const q = invoicesListFiltersSchema.parse(sp);
  const filters = {
    page: q.page,
    from: q.from,
    to: q.to,
    status: q.status,
  };

  let page, totals, payableInvoices, customers, products, registers, warehouses, effectiveRateData;
  try {
    [page, totals, payableInvoices, customers, products, registers, warehouses, effectiveRateData] =
      await Promise.all([
        getInvoicesPage(tenant.id, filters),
        getInvoicesTotals(tenant.id, filters),
        // Padrón completo de abiertas para el modal de cobro: independiente
        // de los filtros y la paginación del listado.
        getOpenInvoicesForPayments(tenant.id),
        getCustomersWithDebt(tenant.id),
        getProductsCatalog(tenant.id),
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
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  const sanitizedCustomers = customers.map((c) => ({
    id: c.id,
    name: c.name,
    taxId: c.taxId,
    email: c.email,
    currentDebtUSD: c.currentDebtUSD,
    priceTier: c.priceTier,
  }));

  const sanitizedProducts = products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    priceUSD: Number(p.priceUSD) || 0,
    unitOfMeasure: p.unitOfMeasure,
    priceTiers: p.priceTiers,
  }));

  return (
    <InvoicesView
      tenantId={tenant.id}
      tenantSlug={tenant.slug}
      invoices={page.docs}
      payableInvoices={payableInvoices}
      listMeta={{ page: page.page, totalPages: page.totalPages, totalDocs: page.totalDocs }}
      totals={totals}
      filters={{ from: q.from, to: q.to, status: q.status }}
      customers={sanitizedCustomers}
      products={sanitizedProducts}
      effectiveRate={effectiveRateData.rate}
      cashRegisters={registers.map((r) => ({
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
  );
}
