import { getPayload, type Where } from 'payload';
import config from '@payload-config';
import type {
  Tenant,
  Customer,
  Product,
  Invoice,
  Quote,
  PurchaseInvoice,
  Supplier,
  CashRegister,
  BillOfMaterial,
  IndustryTemplate,
  Warehouse,
  CashClosure,
  User,
} from '@/payload-types';
import { getLiveExchangeRates, resolveEffectiveRate } from './exchangeRate';
import { ErpAccessError, requireErpTenantAccess, getErpUser, requireErpUser } from './erpAuth';

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

// Estados que computan deuda viva: los borradores y anulados NO obligan.
// CADA colección tiene su vocabulario: ventas usan `issued`; compras usan `received`.
const OPEN_SALE_INVOICE_STATUSES = ['issued', 'partially_paid'] as const;
const OPEN_PURCHASE_INVOICE_STATUSES = ['received', 'partially_paid'] as const;

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  // Blindaje anti-enumeración: sin sesión no se revela ni la existencia de inquilinos.
  await requireErpUser();
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
  // Sin sesión no hay listado de empresas. Con sesión, cada usuario ve únicamente
  // los inquilinos a los que pertenece (super-admin ve todos).
  const user = await requireErpUser();
  const payload = await getPayload({ config });

  if (user.role === 'super-admin') {
    const result = await payload.find({
      collection: 'tenants',
      pagination: false,
      depth: 0,
      sort: 'name',
    });
    return result.docs as Tenant[];
  }

  const userTenantIds = (
    (user as unknown as { tenants?: Array<{ tenant: number | { id: number } }> })?.tenants || []
  )
    .map((t) => (typeof t.tenant === 'object' && t.tenant !== null ? t.tenant.id : t.tenant))
    .filter(Boolean);

  if (userTenantIds.length === 0) {
    return [];
  }

  const result = await payload.find({
    collection: 'tenants',
    where: { id: { in: userTenantIds } },
    pagination: false,
    depth: 0,
    sort: 'name',
  });
  return result.docs as Tenant[];
}

/**
 * Trae TODOS los documentos que matcheen el filtro paginando hasta el final.
 * Los agregados financieros y operativos nunca deben truncarse por el límite de página.
 * Toda consulta corre con `overrideAccess: false` + usuario autenticado, de modo que
 * el control de acceso de las colecciones (multi-tenant) se evalúa siempre.
 */
type ErpDataCollection =
  | 'customers'
  | 'products'
  | 'invoices'
  | 'quotes'
  | 'purchase-invoices'
  | 'suppliers'
  | 'cash-registers'
  | 'bill-of-materials'
  | 'warehouses'
  | 'cash-closures';

async function findAllDocs<T>(args: {
  collection: ErpDataCollection;
  where?: Where;
  depth?: number;
  sort?: string;
  user: User;
}): Promise<T[]> {
  const payload = await getPayload({ config });
  let page = 1;
  const allDocs: T[] = [];
  let hasNextPage = true;

  while (hasNextPage) {
    const res = await payload.find({
      collection: args.collection,
      where: args.where,
      depth: args.depth ?? 0,
      sort: args.sort,
      limit: 500,
      page,
      user: args.user,
      overrideAccess: false,
    });
    allDocs.push(...(res.docs as T[]));
    hasNextPage = Boolean(res.hasNextPage);
    page += 1;
  }

  return allDocs;
}

export async function getDashboardMetrics(tenant: Tenant): Promise<DashboardMetrics> {
  // Blindaje de acceso: sin sesión válida y pertenencia al inquilino no hay datos.
  const user = await requireErpTenantAccess(tenant.id);
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

  // Consultas concurrentes en Local API de Payload (0 latencia de red), SIN truncar:
  const [
    openInvoices,
    openPurchaseInvoices,
    allCustomers,
    allProducts,
    allRegisters,
    allBoms,
    recentInvoicesRes,
    topDebtorsRes,
  ] = await Promise.all([
    findAllDocs<Invoice>({
      collection: 'invoices',
      where: {
        and: [
          { tenant: { equals: tenantId } },
          { status: { in: [...OPEN_SALE_INVOICE_STATUSES] } },
        ],
      },
      depth: 0,
      user,
    }),
    findAllDocs<PurchaseInvoice>({
      collection: 'purchase-invoices',
      where: {
        and: [
          { tenant: { equals: tenantId } },
          { status: { in: [...OPEN_PURCHASE_INVOICE_STATUSES] } },
        ],
      },
      depth: 0,
      user,
    }),
    findAllDocs<Customer>({
      collection: 'customers',
      where: { tenant: { equals: tenantId } },
      depth: 0,
      sort: '-currentDebtUSD',
      user,
    }),
    findAllDocs<Product>({
      collection: 'products',
      where: { tenant: { equals: tenantId } },
      depth: 0,
      sort: 'currentStock',
      user,
    }),
    findAllDocs<CashRegister>({
      collection: 'cash-registers',
      where: { tenant: { equals: tenantId } },
      depth: 0,
      user,
    }),
    findAllDocs<BillOfMaterial>({
      collection: 'bill-of-materials',
      where: { tenant: { equals: tenantId } },
      depth: 0,
      user,
    }),
    payload.find({
      collection: 'invoices',
      where: {
        and: [
          { tenant: { equals: tenantId } },
          { status: { not_equals: 'draft' } },
        ],
      },
      limit: 6,
      depth: 1,
      sort: '-createdAt',
      user,
      overrideAccess: false,
    }),
    payload.find({
      collection: 'customers',
      where: {
        and: [
          { tenant: { equals: tenantId } },
          { currentDebtUSD: { greater_than: 0 } },
        ],
      },
      limit: 5,
      depth: 0,
      sort: '-currentDebtUSD',
      user,
      overrideAccess: false,
    }),
  ]);

  // Totales CxC (facturas vivas: emitidas y parcialmente abonadas)
  let totalReceivablesUSD = 0;
  for (const inv of openInvoices) {
    totalReceivablesUSD += Number(inv.balanceUSD) || 0;
  }
  const totalReceivablesVES = totalReceivablesUSD * effectiveRate;

  // Totales CxP
  let totalPayablesUSD = 0;
  for (const pinv of openPurchaseInvoices) {
    totalPayablesUSD += Number(pinv.balanceUSD) || 0;
  }
  const totalPayablesVES = totalPayablesUSD * effectiveRate;

  // Desglose de Antigüedad de Deuda (cartera completa, sin truncar)
  let zeroToThirtyUSD = 0;
  let thirtyOneToSixtyUSD = 0;
  let sixtyPlusUSD = 0;
  let overdueCustomersCount = 0;

  for (const cust of allCustomers) {
    zeroToThirtyUSD += Number(cust.aging0to30) || 0;
    thirtyOneToSixtyUSD += Number(cust.aging31to60) || 0;
    sixtyPlusUSD += Number(cust.aging60Plus) || 0;
    if ((Number(cust.overdueDebtUSD) || 0) > 0) {
      overdueCustomersCount++;
    }
  }

  // Stock crítico (cartera completa)
  const criticalProducts: Product[] = [];
  for (const prod of allProducts) {
    const min = Number(prod.minStockAlert) || 0;
    const current = Number(prod.currentStock) || 0;
    if (min > 0 && current <= min) {
      criticalProducts.push(prod);
    }
  }

  // Cajas abiertas (cartera completa)
  const openRegistersCount = allRegisters.filter((cr) => cr.currentStatus === 'open').length;

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
      totalCustomers: allCustomers.length,
      overdueCustomersCount,
      totalProducts: allProducts.length,
      lowStockCount: criticalProducts.length,
      openRegistersCount,
      totalRegistersCount: allRegisters.length,
      totalBomsCount: allBoms.length,
    },
    recentInvoices: recentInvoicesRes.docs as Invoice[],
    criticalProducts: criticalProducts.slice(0, 5),
    topDebtors: topDebtorsRes.docs as Customer[],
  };
}

export async function getCustomersWithDebt(tenantId: number): Promise<Customer[]> {
  const user = await requireErpTenantAccess(tenantId);
  return findAllDocs<Customer>({
    collection: 'customers',
    where: { tenant: { equals: tenantId } },
    depth: 0,
    sort: '-currentDebtUSD',
    user,
  });
}

export async function getProductsCatalog(tenantId: number): Promise<Product[]> {
  const user = await requireErpTenantAccess(tenantId);
  return findAllDocs<Product>({
    collection: 'products',
    where: { tenant: { equals: tenantId } },
    depth: 1,
    sort: 'name',
    user,
  });
}

export async function getCashRegistersWithDetails(tenantId: number): Promise<CashRegister[]> {
  const user = await requireErpTenantAccess(tenantId);
  return findAllDocs<CashRegister>({
    collection: 'cash-registers',
    where: { tenant: { equals: tenantId } },
    depth: 1,
    sort: 'name',
    user,
  });
}

export async function getBillOfMaterialsList(tenantId: number): Promise<BillOfMaterial[]> {
  const user = await requireErpTenantAccess(tenantId);
  return findAllDocs<BillOfMaterial>({
    collection: 'bill-of-materials',
    where: { tenant: { equals: tenantId } },
    depth: 2,
    sort: 'name',
    user,
  });
}

export async function getIndustryTemplatesCatalog(): Promise<IndustryTemplate[]> {
  const user = await getErpUser();
  if (!user) {
    throw new ErpAccessError(401, 'No autenticado: inicie sesión para ver el catálogo de plantillas.');
  }
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: 'industry-templates',
    where: { isPublished: { equals: true } },
    pagination: false,
    depth: 0,
    sort: 'name',
    user,
    overrideAccess: false,
  });
  return result.docs as IndustryTemplate[];
}

export async function getInvoicesList(tenantId: number): Promise<Invoice[]> {
  const user = await requireErpTenantAccess(tenantId);
  return findAllDocs<Invoice>({
    collection: 'invoices',
    where: { tenant: { equals: tenantId } },
    depth: 1,
    sort: '-createdAt',
    user,
  });
}

export async function getWarehousesList(tenantId: number): Promise<Warehouse[]> {
  const user = await requireErpTenantAccess(tenantId);
  return findAllDocs<Warehouse>({
    collection: 'warehouses',
    where: { tenant: { equals: tenantId } },
    depth: 0,
    sort: 'name',
    user,
  });
}

export async function getCashClosuresList(tenantId: number): Promise<CashClosure[]> {
  const user = await requireErpTenantAccess(tenantId);
  return findAllDocs<CashClosure>({
    collection: 'cash-closures',
    where: { tenant: { equals: tenantId } },
    depth: 1,
    sort: '-createdAt',
    user,
  });
}

export async function getSuppliersPageData(
  tenantId: number,
): Promise<{ suppliers: Supplier[]; openPurchaseInvoices: PurchaseInvoice[] }> {
  const user = await requireErpTenantAccess(tenantId);

  const [suppliers, openPurchaseInvoices] = await Promise.all([
    findAllDocs<Supplier>({
      collection: 'suppliers',
      where: { tenant: { equals: tenantId } },
      depth: 0,
      sort: '-currentDebtUSD',
      user,
    }),
    findAllDocs<PurchaseInvoice>({
      collection: 'purchase-invoices',
      where: {
        and: [
          { tenant: { equals: tenantId } },
          { status: { in: [...OPEN_PURCHASE_INVOICE_STATUSES] } },
        ],
      },
      depth: 1,
      sort: 'dueDate',
      user,
    }),
  ]);

  return { suppliers, openPurchaseInvoices };
}

export async function getQuotesList(tenantId: number): Promise<Quote[]> {
  const user = await requireErpTenantAccess(tenantId);
  return findAllDocs<Quote>({
    collection: 'quotes',
    where: { tenant: { equals: tenantId } },
    depth: 1,
    sort: '-createdAt',
    user,
  });
}
