import { getPayload } from 'payload';
import config from '@payload-config';
import type {
  Tenant,
  Customer,
  Product,
  Invoice,
  PurchaseInvoice,
  CashRegister,
  BillOfMaterial,
  IndustryTemplate,
  Warehouse,
  CashClosure,
} from '@/payload-types';
import { getLiveExchangeRates, resolveEffectiveRate } from './exchangeRate';

export interface DashboardMetrics {
  tenant: Tenant;
  rates: {
    bcv: number | null;
    binance: number | null;
    paralelo: number | null;
    effectiveRate: number;
    source: string;
    lastUpdated: string;
  };
  financials: {
    totalReceivablesUSD: number;
    totalReceivablesVES: number;
    totalPayablesUSD: number;
    totalPayablesVES: number;
    aging: {
      zeroToThirtyUSD: number;
      thirtyOneToSixtyUSD: number;
      sixtyPlusUSD: number;
    };
  };
  operations: {
    totalCustomers: number;
    overdueCustomersCount: number;
    totalProducts: number;
    lowStockCount: number;
    openRegistersCount: number;
    totalRegistersCount: number;
    totalBomsCount: number;
  };
  recentInvoices: Invoice[];
  criticalProducts: Product[];
  topDebtors: Customer[];
}

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: 'tenants',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
  });
  return (result.docs[0] as Tenant) || null;
}

export async function getAllTenants(): Promise<Tenant[]> {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: 'tenants',
    limit: 100,
    depth: 0,
    sort: 'name',
  });
  return result.docs as Tenant[];
}

export async function getDashboardMetrics(tenant: Tenant): Promise<DashboardMetrics> {
  const payload = await getPayload({ config });
  const tenantId = tenant.id;

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

  const effectiveRate = effectiveRateData.rate;

  // Consultas concurrentes en Local API de Payload (0 latencia de red)
  const [
    invoicesRes,
    purchaseInvoicesRes,
    customersRes,
    productsRes,
    registersRes,
    bomsRes,
  ] = await Promise.all([
    payload.find({
      collection: 'invoices',
      where: {
        and: [
          { tenant: { equals: tenantId } },
          { status: { not_equals: 'paid' } },
        ],
      },
      limit: 100,
      depth: 1,
      sort: '-createdAt',
    }),
    payload.find({
      collection: 'purchase-invoices',
      where: {
        and: [
          { tenant: { equals: tenantId } },
          { status: { not_equals: 'paid' } },
        ],
      },
      limit: 100,
      depth: 0,
    }),
    payload.find({
      collection: 'customers',
      where: { tenant: { equals: tenantId } },
      limit: 100,
      depth: 0,
      sort: '-currentDebtUSD',
    }),
    payload.find({
      collection: 'products',
      where: { tenant: { equals: tenantId } },
      limit: 200,
      depth: 1,
      sort: 'currentStock',
    }),
    payload.find({
      collection: 'cash-registers',
      where: { tenant: { equals: tenantId } },
      limit: 50,
      depth: 1,
    }),
    payload.find({
      collection: 'bill-of-materials',
      where: { tenant: { equals: tenantId } },
      limit: 50,
      depth: 0,
    }),
  ]);

  // Totales CxC
  let totalReceivablesUSD = 0;
  for (const inv of invoicesRes.docs as Invoice[]) {
    totalReceivablesUSD += Number(inv.balanceUSD) || 0;
  }
  const totalReceivablesVES = totalReceivablesUSD * effectiveRate;

  // Totales CxP
  let totalPayablesUSD = 0;
  for (const pinv of purchaseInvoicesRes.docs as PurchaseInvoice[]) {
    totalPayablesUSD += Number(pinv.balanceUSD) || 0;
  }
  const totalPayablesVES = totalPayablesUSD * effectiveRate;

  // Desglose de Antigüedad de Deuda
  let zeroToThirtyUSD = 0;
  let thirtyOneToSixtyUSD = 0;
  let sixtyPlusUSD = 0;
  let overdueCustomersCount = 0;

  for (const cust of customersRes.docs as Customer[]) {
    zeroToThirtyUSD += Number(cust.aging0to30) || 0;
    thirtyOneToSixtyUSD += Number(cust.aging31to60) || 0;
    sixtyPlusUSD += Number(cust.aging60Plus) || 0;
    if ((Number(cust.overdueDebtUSD) || 0) > 0) {
      overdueCustomersCount++;
    }
  }

  // Stock crítico
  const criticalProducts: Product[] = [];
  for (const prod of productsRes.docs as Product[]) {
    const min = Number(prod.minStockAlert) || 0;
    const current = Number(prod.currentStock) || 0;
    if (min > 0 && current <= min) {
      criticalProducts.push(prod);
    }
  }

  // Cajas abiertas
  const openRegistersCount = (registersRes.docs as CashRegister[]).filter(
    (cr) => cr.currentStatus === 'open',
  ).length;

  return {
    tenant,
    rates: {
      bcv: liveRates.bcv,
      binance: liveRates.binance,
      paralelo: liveRates.paralelo,
      effectiveRate,
      source: effectiveRateData.source,
      lastUpdated: liveRates.lastUpdated,
    },
    financials: {
      totalReceivablesUSD,
      totalReceivablesVES,
      totalPayablesUSD,
      totalPayablesVES,
      aging: {
        zeroToThirtyUSD,
        thirtyOneToSixtyUSD,
        sixtyPlusUSD,
      },
    },
    operations: {
      totalCustomers: customersRes.totalDocs,
      overdueCustomersCount,
      totalProducts: productsRes.totalDocs,
      lowStockCount: criticalProducts.length,
      openRegistersCount,
      totalRegistersCount: registersRes.totalDocs,
      totalBomsCount: bomsRes.totalDocs,
    },
    recentInvoices: (invoicesRes.docs as Invoice[]).slice(0, 6),
    criticalProducts: criticalProducts.slice(0, 5),
    topDebtors: (customersRes.docs as Customer[])
      .filter((c) => (Number(c.currentDebtUSD) || 0) > 0)
      .slice(0, 5),
  };
}

export async function getCustomersWithDebt(tenantId: number): Promise<Customer[]> {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: 'customers',
    where: { tenant: { equals: tenantId } },
    limit: 100,
    depth: 0,
    sort: '-currentDebtUSD',
  });
  return result.docs as Customer[];
}

export async function getProductsCatalog(tenantId: number): Promise<Product[]> {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: 'products',
    where: { tenant: { equals: tenantId } },
    limit: 200,
    depth: 1,
    sort: 'name',
  });
  return result.docs as Product[];
}

export async function getCashRegistersWithDetails(tenantId: number): Promise<CashRegister[]> {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: 'cash-registers',
    where: { tenant: { equals: tenantId } },
    limit: 50,
    depth: 1,
    sort: 'name',
  });
  return result.docs as CashRegister[];
}

export async function getBillOfMaterialsList(tenantId: number): Promise<BillOfMaterial[]> {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: 'bill-of-materials',
    where: { tenant: { equals: tenantId } },
    limit: 50,
    depth: 2,
    sort: 'name',
  });
  return result.docs as BillOfMaterial[];
}

export async function getIndustryTemplatesCatalog(): Promise<IndustryTemplate[]> {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: 'industry-templates',
    where: { isPublished: { equals: true } },
    pagination: false,
    depth: 0,
    sort: 'name',
  });
  return result.docs as IndustryTemplate[];
}

export async function getInvoicesList(tenantId: number): Promise<Invoice[]> {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: 'invoices',
    where: { tenant: { equals: tenantId } },
    limit: 100,
    depth: 1,
    sort: '-createdAt',
  });
  return result.docs as Invoice[];
}

export async function getWarehousesList(tenantId: number): Promise<Warehouse[]> {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: 'warehouses',
    where: { tenant: { equals: tenantId } },
    limit: 50,
    depth: 0,
    sort: 'name',
  });
  return result.docs as Warehouse[];
}

export async function getCashClosuresList(tenantId: number): Promise<CashClosure[]> {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: 'cash-closures',
    where: { tenant: { equals: tenantId } },
    limit: 50,
    depth: 1,
    sort: '-createdAt',
  });
  return result.docs as CashClosure[];
}
