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
  CustomerPayment,
  InventoryCount,
  StockMovement,
  SupplierPayment,
  Order,
  DeliveryNote,
  Alert,
  PriceHistory,
  User,
} from '@/payload-types';
import {
  aggregateAgingByVendor,
  computeAgingRows,
  summarizeAging,
  type AgingInvoiceInput,
  type AgingRow,
  type AgingSummary,
  type VendorAgingRow,
} from './arAging';
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
  | 'purchase-invoices'
  | 'supplier-payments'
  | 'inventory-counts'
  | 'customers'
  | 'products'
  | 'invoices'
  | 'quotes'
  | 'orders'
  | 'delivery-notes'
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

/** Pedidos de venta (Sprint 19) para la vista de pedidos. */
export async function getOrdersList(tenantId: number): Promise<Order[]> {
  const user = await requireErpTenantAccess(tenantId);
  return findAllDocs<Order>({
    collection: 'orders',
    where: { tenant: { equals: tenantId } },
    depth: 1,
    sort: '-createdAt',
    user,
  });
}

export interface OrderDetailData {
  order: Order;
  invoice: Invoice | null;
  /** Remisiones emitidas (no anuladas) del pedido. */
  deliveryNotes: DeliveryNote[];
  /** Cantidades despachadas por índice de línea del pedido. */
  dispatchedByIndex: Record<number, number>;
}

/** Detalle de pedido: pedido + factura emitida + remisiones con crosstab de despacho. */
export async function getOrderDetail(
  tenantId: number,
  orderId: number,
): Promise<OrderDetailData> {
  const user = await requireErpTenantAccess(tenantId);
  const payload = await getPayload({ config });

  const order = (await payload.findByID({
    collection: 'orders',
    id: orderId,
    depth: 1,
    user,
    overrideAccess: false,
  })) as Order;

  if (!order || Number(order.tenant) !== Number(tenantId)) {
    throw new Error('Pedido no encontrado en este inquilino.');
  }

  let invoice: Invoice | null = null;
  const invoiceId =
    typeof order.issuedInvoice === 'object' && order.issuedInvoice !== null
      ? order.issuedInvoice.id
      : order.issuedInvoice;
  if (invoiceId) {
    invoice = (await payload.findByID({
      collection: 'invoices',
      id: invoiceId as number,
      depth: 0,
      user,
      overrideAccess: false,
    })) as Invoice;
  }

  // Remisiones emitidas del pedido (las anuladas no cuentan como despacho)
  const notesRes = await payload.find({
    collection: 'delivery-notes',
    where: {
      and: [
        { order: { equals: orderId } },
        { status: { equals: 'issued' } },
      ],
    },
    depth: 0,
    sort: 'createdAt',
    limit: 200,
    user,
    overrideAccess: false,
  });
  const deliveryNotes = notesRes.docs as DeliveryNote[];
  const dispatchedByIndex: Record<number, number> = {};
  for (const note of deliveryNotes) {
    for (const item of Array.isArray(note.items) ? note.items : []) {
      const idx = Number(item.orderItemIndex);
      dispatchedByIndex[idx] = (dispatchedByIndex[idx] || 0) + (Number(item.quantity) || 0);
    }
  }

  return { order, invoice, deliveryNotes, dispatchedByIndex };
}

/** Detalle de una remisión (Sprint 20) para la página imprimible. */
export async function getDeliveryNoteDetail(
  tenantId: number,
  noteId: number,
): Promise<DeliveryNote | null> {
  const user = await requireErpTenantAccess(tenantId);
  const payload = await getPayload({ config });

  const note = (await payload.findByID({
    collection: 'delivery-notes',
    id: noteId,
    depth: 1,
    user,
    overrideAccess: false,
  })) as DeliveryNote;

  if (!note || Number(note.tenant) !== Number(tenantId)) {
    return null;
  }
  return note;
}

export interface ReceivablesPageData {
  isVendor: boolean;
  vendors: Array<{ id: number; name: string }>;
  rows: AgingRow[];
  vendorRows: VendorAgingRow[];
  summary: AgingSummary;
  asOf: string;
}

/**
 * Cartera con antigüedad (Sprint 21). Facturas abiertas de venta
 * (issued/partially_paid con saldo) agregadas por cliente en buckets
 * 0-30/31-60/61-90/90+ vía la utility pura arAging. El rol `vendor` solo ve
 * SU cartera (clientes con assignedVendor = user.id); admin/supervisor ven
 * todo el inquilino.
 */
export async function getAccountsReceivableData(tenantId: number): Promise<ReceivablesPageData> {
  const user = await requireErpTenantAccess(tenantId);
  const isVendor = user.role === 'vendor';
  const payload = await getPayload({ config });

  // Vendedores del inquilino (para nombres y filtro del canal)
  const vendorsRes = await payload.find({
    collection: 'users',
    where: {
      and: [
        { role: { equals: 'vendor' } },
        { 'tenants.tenant': { equals: tenantId } },
      ],
    },
    pagination: false,
    depth: 0,
    sort: 'name',
    user,
    overrideAccess: false,
  });
  const vendors = (vendorsRes.docs as User[]).map((v) => ({ id: v.id, name: v.name }));
  const vendorNames = new Map<number, string>(vendors.map((v) => [v.id, v.name]));

  // Todos los clientes (para mapear customerId → vendedor asignado)
  const customers = await findAllDocs<Customer>({
    collection: 'customers',
    where: { tenant: { equals: tenantId } },
    depth: 0,
    sort: 'name',
    user,
  });
  const customerInfo = new Map<number, { name: string; vendorId: number | null }>(
    customers.map((c) => [
      c.id,
      {
        name: c.name,
        vendorId: c.assignedVendor
          ? typeof c.assignedVendor === 'object'
            ? c.assignedVendor.id
            : Number(c.assignedVendor)
          : null,
      },
    ]),
  );

  // Facturas abiertas (vendor → solo clientes de su canal)
  const openCustomerIds = isVendor
    ? customers.filter((c) => customerInfo.get(c.id)?.vendorId === user.id).map((c) => c.id)
    : null;
  const invoicesWhere: Where = isVendor
    ? {
        and: [
          { tenant: { equals: tenantId } },
          { status: { in: [...OPEN_SALE_INVOICE_STATUSES] } },
          { customer: { in: openCustomerIds && openCustomerIds.length > 0 ? openCustomerIds : [0] } },
        ],
      }
    : {
        and: [
          { tenant: { equals: tenantId } },
          { status: { in: [...OPEN_SALE_INVOICE_STATUSES] } },
        ],
      };

  const invoicesRes = await payload.find({
    collection: 'invoices',
    where: invoicesWhere,
    pagination: false,
    depth: 0,
    sort: '-createdAt',
    user,
    overrideAccess: false,
  });

  const agingInputs: AgingInvoiceInput[] = [];
  for (const inv of invoicesRes.docs as Invoice[]) {
    const customerId =
      typeof inv.customer === 'object' && inv.customer !== null ? inv.customer.id : Number(inv.customer);
    const info = customerInfo.get(customerId);
    const vendorId = isVendor ? user.id : info?.vendorId ?? null;
    agingInputs.push({
      customerId,
      customerName: info?.name || (typeof inv.customer === 'object' && inv.customer !== null ? inv.customer.name : '—'),
      vendorId,
      vendorName: vendorId ? vendorNames.get(vendorId) || `#${vendorId}` : '—',
      balanceUSD: Number(inv.balanceUSD) || 0,
      dueDate: inv.dueDate,
      issueDate: inv.issueDate,
    });
  }

  const rows = computeAgingRows(agingInputs);
  return {
    isVendor,
    vendors,
    rows,
    vendorRows: aggregateAgingByVendor(rows),
    summary: summarizeAging(rows),
    asOf: new Date().toISOString(),
  };
}

export interface RateHistoryPriceEntry {
  id: number;
  date: string;
  productName: string;
  oldPriceUSD: number;
  newPriceUSD: number;
  exchangeRateSnapshot: number;
  newPriceVES: number;
}

export interface RateHistoryInvoiceEntry {
  id: number;
  invoiceNumber: string;
  date: string;
  exchangeRateSnapshot: number;
}

export interface RatesPageData {
  live: {
    bcv: number | null;
    binance: number | null;
    paralelo: number | null;
    lastUpdated: string;
  };
  effectiveRate: number;
  rateSource: string;
  /** Sólo super-admin/tenant-admin pueden cambiar la configuración de tasa. */
  canEdit: boolean;
  priceHistory: RateHistoryPriceEntry[];
  invoiceHistory: RateHistoryInvoiceEntry[];
}

/**
 * Datos de la página de tasas (Sprint 21): tasas en vivo, tasa efectiva del
 * inquilino e historial de snapshots (price-history + facturas recientes).
 */
export async function getRatesPageData(tenantId: number): Promise<RatesPageData> {
  const user = await requireErpTenantAccess(tenantId);
  const payload = await getPayload({ config });

  const tenant = await payload.findByID({
    collection: 'tenants',
    id: tenantId,
    depth: 0,
    user,
    overrideAccess: false,
  });

  const [live, effective] = await Promise.all([
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

  const priceHistoryRes = await payload.find({
    collection: 'price-history',
    where: { tenant: { equals: tenantId } },
    depth: 1,
    sort: '-createdAt',
    limit: 12,
    user,
    overrideAccess: false,
  });
  const priceHistory: RateHistoryPriceEntry[] = (
    priceHistoryRes.docs as PriceHistory[]
  ).map((ph) => {
    const product =
      typeof ph.product === 'object' && ph.product !== null ? ph.product : null;
    return {
      id: ph.id,
      date: ph.createdAt,
      productName: product ? product.name : '—',
      oldPriceUSD: Number(ph.oldPriceUSD) || 0,
      newPriceUSD: Number(ph.newPriceUSD) || 0,
      exchangeRateSnapshot: Number(ph.exchangeRateSnapshot) || 0,
      newPriceVES: Number(ph.newPriceVES) || 0,
    };
  });

  const invoicesRes = await payload.find({
    collection: 'invoices',
    where: {
      and: [
        { tenant: { equals: tenantId } },
        { status: { not_equals: 'draft' } },
      ],
    },
    depth: 0,
    sort: '-createdAt',
    limit: 10,
    user,
    overrideAccess: false,
  });
  const invoiceHistory: RateHistoryInvoiceEntry[] = (invoicesRes.docs as Invoice[]).map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    date: inv.createdAt,
    exchangeRateSnapshot: Number(inv.exchangeRateSnapshot) || 0,
  }));

  return {
    live: {
      bcv: live.bcv,
      binance: live.binance,
      paralelo: live.paralelo,
      lastUpdated: live.lastUpdated,
    },
    effectiveRate: effective.rate,
    rateSource: effective.source,
    canEdit: user.role === 'super-admin' || user.role === 'tenant-admin',
    priceHistory,
    invoiceHistory,
  };
}

export interface AlertsPageData {
  active: Alert[];
  resolved: Alert[];
  counts: { active: number; unacknowledged: number };
}

/**
 * Centro de alertas (Sprint 22): activas primero (severidad crítica arriba),
 * resueltas al final para el histórico inmediato.
 */
export async function getAlertsPageData(tenantId: number): Promise<AlertsPageData> {
  const user = await requireErpTenantAccess(tenantId);
  const payload = await getPayload({ config });

  const res = await payload.find({
    collection: 'alerts',
    where: { tenant: { equals: tenantId } },
    depth: 1,
    sort: '-createdAt',
    limit: 300,
    user,
    overrideAccess: false,
  });
  const alerts = res.docs as Alert[];

  const severityRank: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  const active = alerts
    .filter((a) => !a.resolvedAt)
    .sort(
      (a, b) =>
        (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3) ||
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  const resolved = alerts
    .filter((a) => Boolean(a.resolvedAt))
    .sort(
      (a, b) => new Date(b.resolvedAt as string).getTime() - new Date(a.resolvedAt as string).getTime(),
    );

  return {
    active,
    resolved: resolved.slice(0, 20),
    counts: {
      active: active.length,
      unacknowledged: active.filter((a) => !a.acknowledgedAt).length,
    },
  };
}

/** Contador de alertas activas sin reconocer — badge de navegación (Sprint 22). */
export async function getActiveAlertCount(tenantId: number): Promise<number> {
  const user = await requireErpTenantAccess(tenantId);
  const payload = await getPayload({ config });

  const res = await payload.find({
    collection: 'alerts',
    where: {
      and: [
        { tenant: { equals: tenantId } },
        { resolvedAt: { exists: false } },
        { acknowledgedAt: { exists: false } },
      ],
    },
    limit: 0,
    depth: 0,
    user,
    overrideAccess: false,
  });
  return res.totalDocs;
}

export interface AuditLogPageData {
  docs: Alert[] | never[];
  auditEntries: Array<{
    id: number;
    actorName: string;
    actorRole: string | null;
    collection: string;
    docId: number | null;
    operation: string;
    diff: Record<string, unknown> | null;
    createdAt: string;
  }>;
  totalDocs: number;
  totalPages: number;
  page: number;
}

/**
 * Vista global de auditoría (Sprint 22). Sólo super-admin/tenant-admin — el
 * acceso de colección ya lo restringe, y aquí se revalida el rol por si el
 * llamador viniera por una vía sin access control.
 */
export async function getAuditLogData(
  tenantId: number,
  filters: {
    page: number;
    collection?: string;
    operation?: string;
    from?: string;
    to?: string;
  },
): Promise<AuditLogPageData> {
  const user = await requireErpTenantAccess(tenantId);
  if (user.role !== 'super-admin' && user.role !== 'tenant-admin') {
    throw new ErpAccessError(403, 'Prohibido: la auditoría es exclusiva de administradores.');
  }
  const payload = await getPayload({ config });

  const and: Where[] = [{ tenant: { equals: tenantId } }];
  if (filters.collection) and.push({ collection: { equals: filters.collection } });
  if (filters.operation) and.push({ operation: { equals: filters.operation } });
  // Mismos bordes de hora de negocio que el kardex (Venezuela, UTC-4)
  if (filters.from) {
    and.push({
      createdAt: { greater_than_equal: new Date(`${filters.from}T00:00:00-04:00`).toISOString() },
    });
  }
  if (filters.to) {
    const toEndExclusive = new Date(`${filters.to}T00:00:00-04:00`);
    toEndExclusive.setUTCDate(toEndExclusive.getUTCDate() + 1);
    and.push({ createdAt: { less_than: toEndExclusive.toISOString() } });
  }

  const res = await payload.find({
    collection: 'audit-log',
    where: { and },
    depth: 1,
    sort: '-createdAt',
    page: filters.page,
    limit: 25,
    user,
    overrideAccess: false,
  });

  const auditEntries = res.docs.map((doc) => {
    const entry = doc as unknown as {
      id: number;
      actor?: { name?: string } | number | null;
      actorRole?: string | null;
      collection: string;
      docId?: number | null;
      operation: string;
      diff?: Record<string, unknown> | null;
      createdAt: string;
    };
    return {
      id: entry.id,
      actorName:
        typeof entry.actor === 'object' && entry.actor !== null
          ? entry.actor.name || `#${(entry.actor as { id?: number }).id ?? ''}`
          : entry.actor
            ? `#${entry.actor}`
            : 'Sistema',
      actorRole: entry.actorRole ?? null,
      collection: entry.collection,
      docId: entry.docId ?? null,
      operation: entry.operation,
      diff: entry.diff ?? null,
      createdAt: entry.createdAt,
    };
  });

  return {
    docs: [],
    auditEntries,
    totalDocs: res.totalDocs,
    totalPages: res.totalPages,
    page: res.page || 1,
  };
}

/** Remisiones del inquilino para la vista de remisiones (Sprint 20). */
export async function getDeliveryNotesList(tenantId: number): Promise<DeliveryNote[]> {
  const user = await requireErpTenantAccess(tenantId);
  return findAllDocs<DeliveryNote>({
    collection: 'delivery-notes',
    where: { tenant: { equals: tenantId } },
    depth: 1,
    sort: '-createdAt',
    user,
  });
}

export interface VendorCommissionRow {
  invoiceId: number;
  invoiceNumber: string;
  customerName: string;
  vendorId: number | null;
  vendorName: string;
  totalUSD: number;
  status: string;
  commissionUSD: number;
}

export interface VendorsPageData {
  isVendor: boolean;
  vendors: User[];
  customers: Customer[];
  commissionRows: VendorCommissionRow[];
  earnedUSD: number;
  pendingUSD: number;
}

/**
 * Datos del canal de vendedores (Sprint 11). Las comisiones se derivan de las
 * facturas: `creadoPor × commissionPct del cliente`, separando ganado (pagado)
 * de pendiente (emitido/parcial). El rol `vendor` solo ve SU cartera; los
 * administradores ven todo el inquilino.
 */
export async function getVendorsPageData(tenantId: number): Promise<VendorsPageData> {
  const user = await requireErpTenantAccess(tenantId);
  const isVendor = user.role === 'vendor';
  const payload = await getPayload({ config });

  // Vendedores del inquilino (usuarios con rol vendor miembros del tenant)
  const vendorsRes = await payload.find({
    collection: 'users',
    where: {
      and: [
        { role: { equals: 'vendor' } },
        { 'tenants.tenant': { equals: tenantId } },
      ],
    },
    pagination: false,
    depth: 0,
    sort: 'name',
    user,
    overrideAccess: false,
  });
  const vendors = vendorsRes.docs as User[];
  const vendorNames = new Map<number, string>(vendors.map((v) => [v.id, v.name]));

  // Cartera: vendor → solo sus clientes; admin → clientes con vendedor asignado
  const customersWhere: Where = isVendor
    ? {
        and: [
          { tenant: { equals: tenantId } },
          { assignedVendor: { equals: user.id } },
        ],
      }
    : {
        and: [
          { tenant: { equals: tenantId } },
          { assignedVendor: { not_equals: null } },
        ],
      };

  const customersRes = await payload.find({
    collection: 'customers',
    where: customersWhere,
    pagination: false,
    depth: 0,
    sort: 'name',
    user,
    overrideAccess: false,
  });
  const customers = customersRes.docs as Customer[];
  const commissionPctByCustomer = new Map<number, number>(
    customers.map((c) => [c.id, Number(c.commissionPct) || 0]),
  );
  const customerNames = new Map<number, string>(customers.map((c) => [c.id, c.name]));

  // Facturas con vendedor (vendor → solo las suyas)
  const invoicesWhere: Where = isVendor
    ? {
        and: [
          { tenant: { equals: tenantId } },
          { createdBy: { equals: user.id } },
          { status: { in: ['issued', 'partially_paid', 'paid'] } },
        ],
      }
    : {
        and: [
          { tenant: { equals: tenantId } },
          { createdBy: { not_equals: null } },
          { status: { in: ['issued', 'partially_paid', 'paid'] } },
        ],
      };

  const invoicesRes = await payload.find({
    collection: 'invoices',
    where: invoicesWhere,
    pagination: false,
    depth: 1,
    sort: '-createdAt',
    user,
    overrideAccess: false,
  });

  let earnedUSD = 0;
  let pendingUSD = 0;
  const commissionRows: VendorCommissionRow[] = (invoicesRes.docs as Invoice[]).map((inv) => {
    const customerId = typeof inv.customer === 'object' && inv.customer !== null ? inv.customer.id : Number(inv.customer);
    const pct = commissionPctByCustomer.get(customerId) || 0;
    const totalUSD = Number(inv.totalUSD) || 0;
    const commissionUSD = Number(((totalUSD * pct) / 100).toFixed(2));

    const vendorId =
      typeof inv.createdBy === 'object' && inv.createdBy !== null ? inv.createdBy.id : Number(inv.createdBy) || null;
    const vendorName = vendorId ? vendorNames.get(vendorId) || `#${vendorId}` : '—';

    const row: VendorCommissionRow = {
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerName: customerNames.get(customerId) || (typeof inv.customer === 'object' && inv.customer !== null ? inv.customer.name : '—'),
      vendorId,
      vendorName,
      totalUSD,
      status: inv.status,
      commissionUSD,
    };

    if (inv.status === 'paid') earnedUSD += commissionUSD;
    else pendingUSD += commissionUSD;

    return row;
  });

  return {
    isVendor,
    vendors,
    customers,
    commissionRows,
    earnedUSD: Number(earnedUSD.toFixed(2)),
    pendingUSD: Number(pendingUSD.toFixed(2)),
  };
}

export async function getInventoryCountsList(tenantId: number): Promise<InventoryCount[]> {
  const user = await requireErpTenantAccess(tenantId);
  return findAllDocs<InventoryCount>({
    collection: 'inventory-counts',
    where: { tenant: { equals: tenantId } },
    depth: 1,
    sort: '-createdAt',
    user,
  });
}

export interface InvoiceDetailData {
  invoice: Invoice;
  payments: CustomerPayment[];
  movements: StockMovement[];
  audit: Array<Record<string, unknown>>;
}

/**
 * Detalle completo de una factura (Sprint 13): documento con líneas, cuotas,
 * pagos aplicados (allocations), kardex vinculado y auditoría (esta última
 * solo visible para super-admin/tenant-admin según el acceso de la colección).
 */
export async function getInvoiceDetail(
  tenantId: number,
  invoiceId: number,
): Promise<InvoiceDetailData> {
  const user = await requireErpTenantAccess(tenantId);
  const payload = await getPayload({ config });

  const invoiceRes = await payload.find({
    collection: 'invoices',
    where: {
      and: [
        { tenant: { equals: tenantId } },
        { id: { equals: invoiceId } },
      ],
    },
    depth: 1,
    limit: 1,
    user,
    overrideAccess: false,
  });

  if (invoiceRes.docs.length === 0) {
    throw new Error('Factura no encontrada en este inquilino.');
  }

  const [paymentsRes, movementsRes, auditRes] = await Promise.all([
    payload.find({
      collection: 'customer-payments',
      where: {
        and: [
          { tenant: { equals: tenantId } },
          { 'allocations.invoice': { equals: invoiceId } },
        ],
      },
      depth: 1,
      sort: '-createdAt',
      user,
      overrideAccess: false,
    }),
    payload.find({
      collection: 'stock-movements',
      where: { invoice: { equals: invoiceId } },
      depth: 1,
      sort: 'createdAt',
      user,
      overrideAccess: false,
    }),
    payload.find({
      collection: 'audit-log',
      where: {
        and: [
          { collection: { equals: 'invoices' } },
          { docId: { equals: invoiceId } },
        ],
      },
      depth: 1,
      sort: '-createdAt',
      limit: 50,
      user,
      overrideAccess: false,
    }),
  ]);

  return {
    invoice: invoiceRes.docs[0] as Invoice,
    payments: paymentsRes.docs as CustomerPayment[],
    movements: movementsRes.docs as StockMovement[],
    audit: auditRes.docs as unknown as Array<Record<string, unknown>>,
  };
}

export interface PurchasesPageData {
  suppliers: Supplier[];
  purchaseInvoices: PurchaseInvoice[];
  supplierPayments: SupplierPayment[];
  totalPayablesUSD: number;
  pendingReceptionCount: number;
}

export async function getPurchasesPageData(tenantId: number): Promise<PurchasesPageData> {
  const user = await requireErpTenantAccess(tenantId);

  const [suppliers, purchaseInvoices, supplierPayments] = await Promise.all([
    findAllDocs<Supplier>({
      collection: 'suppliers',
      where: { tenant: { equals: tenantId } },
      depth: 0,
      sort: 'name',
      user,
    }),
    findAllDocs<PurchaseInvoice>({
      collection: 'purchase-invoices',
      where: { tenant: { equals: tenantId } },
      depth: 1,
      sort: '-createdAt',
      user,
    }),
    findAllDocs<SupplierPayment>({
      collection: 'supplier-payments',
      where: { tenant: { equals: tenantId } },
      depth: 1,
      sort: '-createdAt',
      user,
    }),
  ]);

  const totalPayablesUSD = purchaseInvoices
    .filter((p) => p.status === 'received' || p.status === 'partially_paid')
    .reduce((acc, p) => acc + (Number(p.balanceUSD) || 0), 0);

  const pendingReceptionCount = purchaseInvoices.filter(
    (p) => p.receptionStatus === 'pending' && p.status !== 'voided',
  ).length;

  return {
    suppliers,
    purchaseInvoices,
    supplierPayments,
    totalPayablesUSD: Number(totalPayablesUSD.toFixed(2)),
    pendingReceptionCount,
  };
}

export interface KardexFilters {
  page?: number;
  productId?: number;
  warehouseId?: number;
  movementType?: string;
  from?: string;
  to?: string;
}

/**
 * Kardex paginado con filtros (Sprint 15). Server-side pagination: el kardex
 * crece con cada venta/ajuste — nunca se carga completo en la UI.
 */
export async function getKardexEntries(
  tenantId: number,
  filters: KardexFilters,
): Promise<{
  docs: StockMovement[];
  totalDocs: number;
  totalPages: number;
  page: number;
}> {
  const user = await requireErpTenantAccess(tenantId);
  const payload = await getPayload({ config });

  const and: Where[] = [{ tenant: { equals: tenantId } }];
  if (filters.productId) and.push({ product: { equals: filters.productId } });
  if (filters.warehouseId) {
    and.push({
      or: [
        { sourceWarehouse: { equals: filters.warehouseId } },
        { targetWarehouse: { equals: filters.warehouseId } },
      ],
    });
  }
  if (filters.movementType) and.push({ movementType: { equals: filters.movementType } });
  // Los filtros son fechas de calendario (date-only). Se interpretan en la zona
  // horaria de negocio (Venezuela, UTC-4, sin DST): "hasta" usa borde exclusivo
  // del día siguiente para incluir los movimientos de la tarde/noche local,
  // que un corte 23:59 UTC perdería (19:59 hora Venezuela).
  if (filters.from) {
    and.push({
      createdAt: { greater_than_equal: new Date(`${filters.from}T00:00:00-04:00`).toISOString() },
    });
  }
  if (filters.to) {
    const toEndExclusive = new Date(`${filters.to}T00:00:00-04:00`);
    toEndExclusive.setUTCDate(toEndExclusive.getUTCDate() + 1);
    and.push({ createdAt: { less_than: toEndExclusive.toISOString() } });
  }

  const res = await payload.find({
    collection: 'stock-movements',
    where: { and },
    depth: 1,
    sort: '-createdAt',
    page: filters.page || 1,
    limit: 50,
    user,
    overrideAccess: false,
  });

  return {
    docs: res.docs as StockMovement[],
    totalDocs: res.totalDocs,
    totalPages: res.totalPages,
    page: res.page || 1,
  };
}

export interface CustomerDetailData {
  customer: Customer;
  invoices: Invoice[];
  payments: CustomerPayment[];
}

export async function getCustomerDetail(
  tenantId: number,
  customerId: number,
): Promise<CustomerDetailData> {
  const user = await requireErpTenantAccess(tenantId);
  const payload = await getPayload({ config });

  const customer = (await payload.findByID({
    collection: 'customers',
    id: customerId,
    depth: 0,
    user,
    overrideAccess: false,
  })) as Customer;

  if (!customer || Number(customer.tenant) !== Number(tenantId)) {
    throw new Error('Cliente no encontrado en este inquilino.');
  }

  const [invoicesRes, paymentsRes] = await Promise.all([
    payload.find({
      collection: 'invoices',
      where: {
        and: [
          { tenant: { equals: tenantId } },
          { customer: { equals: customerId } },
          { status: { not_equals: 'draft' } },
        ],
      },
      depth: 0,
      sort: '-createdAt',
      limit: 100,
      user,
      overrideAccess: false,
    }),
    payload.find({
      collection: 'customer-payments',
      where: {
        and: [
          { tenant: { equals: tenantId } },
          { customer: { equals: customerId } },
        ],
      },
      depth: 0,
      sort: '-createdAt',
      limit: 100,
      user,
      overrideAccess: false,
    }),
  ]);

  return {
    customer,
    invoices: invoicesRes.docs as Invoice[],
    payments: paymentsRes.docs as CustomerPayment[],
  };
}

export async function getUsersOfTenant(tenantId: number): Promise<User[]> {
  const user = await requireErpTenantAccess(tenantId);
  const payload = await getPayload({ config });
  const res = await payload.find({
    collection: 'users',
    where: { 'tenants.tenant': { equals: tenantId } },
    pagination: false,
    depth: 0,
    sort: 'name',
    user,
    overrideAccess: false,
  });
  return res.docs as User[];
}
