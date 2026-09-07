import { getPayload } from 'payload';
import config from '@payload-config';
import type { Where } from 'payload';
import type { User } from '@/payload-types';

/**
 * Sprint 31 (Fase 8): datos reales del Dashboard 4 de Efferd. Todo el acceso
 * corre por la Local API con el usuario de la sesión y overrideAccess:false —
 * el aislamiento multi-inquilino lo impone el access de cada colección, y el
 * tenant viaja explícito en cada consulta.
 */

export interface DashboardStatsData {
  label: string;
  value: string;
  delta: number;
  hint: string;
}

export interface RevenueRow {
  date: string; // YYYY-MM-DD (calendario Venezuela, UTC-4)
  revenue: number;
}

export interface CategoryMixDatum {
  category: string;
  share: number;
}

export interface ReturnDailyDatum {
  day: string;
  returnRate: number;
}

export interface QuickActionDatum {
  title: string;
  description: string;
  href: string;
  icon: 'receipt' | 'shopping-cart' | 'zap' | 'wallet';
}

export interface DashboardData {
  stats: DashboardStatsData[];
  revenueDaily: RevenueRow[];
  categoryMix: CategoryMixDatum[];
  returnDaily: ReturnDailyDatum[];
  refundedSharePct: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Zona de negocio del ERP (Venezuela): los buckets diarios usan UTC-4, igual que el kardex. */
function toBusinessDayKey(iso: string): string {
  return new Date(new Date(iso).getTime() - 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function pctDelta(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

const fmtUSD = (value: number): string =>
  `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function getDashboardData(tenantId: number, user: User): Promise<DashboardData> {
  const payload = await getPayload({ config });

  const now = new Date();
  const start30 = new Date(now.getTime() - 30 * DAY_MS);
  const start60 = new Date(now.getTime() - 60 * DAY_MS);

  // Facturas de los últimos 60 días (ventana 30d actual + 30d previa de comparación).
  const invoicesWhere: Where = {
    and: [{ tenant: { equals: tenantId } }, { createdAt: { greater_than_equal: start60.toISOString() } }],
  };
  const [invoicesRes, quotesRes, returnsRes, products] = await Promise.all([
    payload.find({
      collection: 'invoices',
      where: invoicesWhere,
      depth: 0,
      limit: 1000,
      sort: '-createdAt',
      user,
      overrideAccess: false,
    }),
    payload.find({
      collection: 'quotes',
      where: { tenant: { equals: tenantId } },
      depth: 0,
      limit: 1000,
      select: { status: true },
      user,
      overrideAccess: false,
    }),
    payload.find({
      collection: 'stock-movements',
      where: {
        and: [
          { tenant: { equals: tenantId } },
          { movementType: { equals: 'sale_return' } },
          { createdAt: { greater_than_equal: start30.toISOString() } },
        ],
      },
      depth: 0,
      limit: 1000,
      user,
      overrideAccess: false,
    }),
    payload.find({
      collection: 'products',
      where: { tenant: { equals: tenantId } },
      depth: 1,
      limit: 2000,
      select: { category: true },
      user,
      overrideAccess: false,
    }),
  ]);

  const invoices = invoicesRes.docs as unknown as Array<{
    id: number;
    totalUSD?: number | null;
    issueDate?: string | null;
    items?: Array<{ product?: unknown; totalUSD?: number | null }> | null;
    createdAt: string;
  }>;

  // ── Ingresos por día (30d) y comparación 30d vs 30d previos ──
  const revenueByDay = new Map<string, number>();
  let revenue30 = 0;
  let count30 = 0;
  let revenuePrev = 0;
  let countPrev = 0;
  for (const invoice of invoices) {
    const total = Number(invoice.totalUSD) || 0;
    const created = new Date(invoice.createdAt);
    if (created >= start30) {
      revenue30 += total;
      count30 += 1;
      const key = toBusinessDayKey(invoice.issueDate || invoice.createdAt);
      revenueByDay.set(key, (revenueByDay.get(key) ?? 0) + total);
    } else {
      revenuePrev += total;
      countPrev += 1;
    }
  }

  const revenueDaily: RevenueRow[] = [];
  const startDay = toBusinessDayKey(start30.toISOString());
  for (let i = 0; i <= 30; i += 1) {
    const key = toBusinessDayKey(new Date(now.getTime() - i * DAY_MS).toISOString());
    if (key < startDay) break;
    revenueDaily.push({ date: key, revenue: Number((revenueByDay.get(key) ?? 0).toFixed(2)) });
  }
  revenueDaily.reverse();

  const avg30 = count30 > 0 ? revenue30 / count30 : 0;
  const avgPrev = countPrev > 0 ? revenuePrev / countPrev : 0;

  // ── Mix de ingresos por categoría (30d), desde product.category de cada línea ──
  const categoryByProduct = new Map<number, string>();
  for (const product of products.docs as unknown as Array<{
    id: number;
    category?: { title?: string } | number | null;
  }>) {
    const category = product.category;
    if (category && typeof category === 'object' && category.title) {
      categoryByProduct.set(product.id, category.title);
    }
  }
  const revenueByCategory = new Map<string, number>();
  let categorizedRevenue = 0;
  for (const invoice of invoices) {
    if (new Date(invoice.createdAt) < start30) continue;
    for (const line of invoice.items ?? []) {
      const productId =
        line.product != null ? Number(Array.isArray(line.product) ? line.product[0] : line.product) : NaN;
      const category = Number.isFinite(productId) ? categoryByProduct.get(productId) : undefined;
      if (!category) continue;
      revenueByCategory.set(category, (revenueByCategory.get(category) ?? 0) + (Number(line.totalUSD) || 0));
      categorizedRevenue += Number(line.totalUSD) || 0;
    }
  }
  const totalMix = categorizedRevenue > 0 ? categorizedRevenue : 1;
  const categoryMix: CategoryMixDatum[] = [...revenueByCategory.entries()]
    .map(([category, revenue]) => ({
      category,
      share: Number(((revenue / totalMix) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 8);

  // ── Devoluciones (30d) ──
  const returnDays = new Map<string, number>();
  for (const movement of returnsRes.docs as unknown as Array<{ createdAt: string }>) {
    const key = toBusinessDayKey(movement.createdAt);
    returnDays.set(key, (returnDays.get(key) ?? 0) + 1);
  }
  const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const returnDaily: ReturnDailyDatum[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const key = toBusinessDayKey(new Date(now.getTime() - i * DAY_MS).toISOString());
    const dateObj = new Date(`${key}T12:00:00`);
    const invoicesThatDay = invoices.filter((invoice) => toBusinessDayKey(invoice.createdAt) === key).length;
    const rate = invoicesThatDay > 0 ? ((returnDays.get(key) ?? 0) / invoicesThatDay) * 100 : 0;
    returnDaily.push({ day: DAY_NAMES[dateObj.getUTCDay()], returnRate: Number(rate.toFixed(1)) });
  }
  const refundedSharePct = count30 > 0 ? Number(((returnsRes.totalDocs / count30) * 100).toFixed(1)) : 0;

  // ── Conversión de cotizaciones (histórico del inquilino) ──
  const totalQuotes = quotesRes.totalDocs;
  const convertedQuotes = (quotesRes.docs as unknown as Array<{ status: string }>).filter(
    (quote) => quote.status === 'converted',
  ).length;
  const conversionPct = totalQuotes > 0 ? (convertedQuotes / totalQuotes) * 100 : 0;

  const stats: DashboardStatsData[] = [
    {
      label: 'Ingresos (30 días)',
      value: fmtUSD(revenue30),
      delta: pctDelta(revenue30, revenuePrev),
      hint: 'vs 30 días previos',
    },
    {
      label: 'Facturas emitidas',
      value: String(count30),
      delta: pctDelta(count30, countPrev),
      hint: 'vs 30 días previos',
    },
    {
      label: 'Ticket promedio',
      value: fmtUSD(avg30),
      delta: pctDelta(avg30, avgPrev),
      hint: 'vs 30 días previos',
    },
    {
      label: 'Conversión de cotizaciones',
      value: `${conversionPct.toFixed(1)}%`,
      delta: 0,
      hint: `${convertedQuotes} de ${totalQuotes} convertidas`,
    },
  ];

  return {
    stats,
    revenueDaily,
    categoryMix,
    returnDaily,
    refundedSharePct,
  };
}
