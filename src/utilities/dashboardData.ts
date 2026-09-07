import { getPayload } from 'payload';
import config from '@payload-config';
import type { Where } from 'payload';
import type { User } from '@/payload-types';

/**
 * Sprint 31 (Fase 8): datos reales del Dashboard 4 de Efferd. Todo el acceso
 * corre por la Local API con el usuario de la sesión y overrideAccess:false —
 * el aislamiento multi-inquilino lo impone el access de cada colección, y el
 * tenant viaja explícito en cada consulta.
 *
 * Correcciones de la ronda Devin (PR #42):
 * - FIX paginación: todas las lecturas son paginadas completas (while
 *   hasNextPage); nunca se mezcla totalDocs con docs de una sola página.
 * - FIX estados: sólo facturas con estado que genera ingreso
 *   (issued / partially_paid / paid) — draft y voided no cuentan en ingresos,
 *   tickets, mix de categorías ni denominadores de devoluciones.
 * - FIX base de fecha UNIFICADA: businessDate = issueDate || createdAt filtra,
 *   clasifica y bucketiza — una factura con fecha retroactiva ya no cae fuera
 *   del gráfico ni se duplica entre ventanas.
 * - FIX categorías: Categories almacena `name` (no `title`).
 * - FIX devoluciones: se deduplican por FACTURA (un sale_return multi-producto
 *   genera varios movimientos y contaba varias veces).
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

/** Fecha de negocio de la factura: la declarada; si faltara, la de creación. */
function invoiceBusinessDate(invoice: { issueDate?: string | null; createdAt: string }): string {
  return invoice.issueDate || invoice.createdAt;
}

function pctDelta(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

const fmtUSD = (value: number): string =>
  `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Lectura paginada completa: procesa TODOS los registros que matchean el where. */
async function findAllMatching<T>(
  collection: 'invoices' | 'quotes' | 'stock-movements' | 'products',
  where: Where,
  user: User,
  depth = 0,
): Promise<T[]> {
  const payload = await getPayload({ config });
  const all: T[] = [];
  let page = 1;
  let hasNextPage = true;
  while (hasNextPage) {
    const res = await payload.find({
      collection,
      where,
      depth,
      limit: 500,
      page,
      sort: 'id',
      user,
      overrideAccess: false,
    });
    all.push(...(res.docs as unknown as T[]));
    hasNextPage = res.hasNextPage;
    page += 1;
  }
  return all;
}

interface InvoiceLike {
  totalUSD?: number | null;
  issueDate?: string | null;
  items?: Array<{ product?: unknown; totalUSD?: number | null }> | null;
  createdAt: string;
  status: string;
}

export async function getDashboardData(tenantId: number, user: User): Promise<DashboardData> {
  const now = new Date();
  const start30 = new Date(now.getTime() - 30 * DAY_MS);
  const start60 = new Date(now.getTime() - 60 * DAY_MS);

  // Estados que generan ingreso: draft y voided NO cuentan en ninguna métrica.
  const REVENUE_STATUSES = ['issued', 'partially_paid', 'paid'];

  const [invoices, quotes, returnMovements, products] = await Promise.all([
    findAllMatching<InvoiceLike>(
      'invoices',
      {
        and: [
          { tenant: { equals: tenantId } },
          { status: { in: REVENUE_STATUSES } },
          { createdAt: { greater_than_equal: start60.toISOString() } },
        ],
      },
      user,
    ),
    findAllMatching<{ status: string }>(
      'quotes',
      { tenant: { equals: tenantId } },
      user,
    ),
    findAllMatching<{ invoice?: number | null; createdAt: string; id: number }>(
      'stock-movements',
      {
        and: [
          { tenant: { equals: tenantId } },
          { movementType: { equals: 'sale_return' } },
          { createdAt: { greater_than_equal: start30.toISOString() } },
        ],
      },
      user,
    ),
    findAllMatching<{ id: number; category?: { name?: string } | number | null }>(
      'products',
      { tenant: { equals: tenantId } },
      user,
      1,
    ),
  ]);

  // ── Facturas clasificadas por FECHA DE NEGOCIO (issueDate || createdAt):
  //    la misma base filtra las ventanas y arma los buckets del gráfico. ──
  const invoicesIn60 = invoices.filter(
    (invoice) => new Date(invoiceBusinessDate(invoice)) >= start60,
  );
  const revenueByDay = new Map<string, number>();
  let revenue30 = 0;
  let count30 = 0;
  let revenuePrev = 0;
  let countPrev = 0;
  for (const invoice of invoicesIn60) {
    const total = Number(invoice.totalUSD) || 0;
    const business = new Date(invoiceBusinessDate(invoice));
    if (business >= start30) {
      revenue30 += total;
      count30 += 1;
      const key = toBusinessDayKey(invoiceBusinessDate(invoice));
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
  for (const product of products) {
    const category = product.category;
    if (category && typeof category === 'object' && category.name) {
      categoryByProduct.set(product.id, category.name);
    }
  }
  const revenueByCategory = new Map<string, number>();
  let categorizedRevenue = 0;
  for (const invoice of invoicesIn60) {
    if (new Date(invoiceBusinessDate(invoice)) < start30) continue;
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

  // ── Devoluciones (30d), deduplicadas por FACTURA ──
  const movementKey = (movement: { invoice?: number | null; id: number }): string =>
    movement.invoice != null ? `inv:${movement.invoice}` : `mov:${movement.id}`;
  // Una devolución multi-producto genera varios movimientos de la MISMA
  // factura: se cuenta una sola vez (sin factura asociada, el movimiento propio).
  const returnedInvoiceKeys30 = new Set(returnMovements.map(movementKey));
  const returnDays = new Map<string, Set<string>>();
  for (const movement of returnMovements) {
    const key = toBusinessDayKey(movement.createdAt);
    const keySet = returnDays.get(key) ?? new Set<string>();
    keySet.add(movementKey(movement));
    returnDays.set(key, keySet);
  }

  const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const returnDaily: ReturnDailyDatum[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const key = toBusinessDayKey(new Date(now.getTime() - i * DAY_MS).toISOString());
    const dateObj = new Date(`${key}T12:00:00`);
    const invoicesThatDay = invoicesIn60.filter(
      (invoice) => toBusinessDayKey(invoiceBusinessDate(invoice)) === key,
    ).length;
    const rate = invoicesThatDay > 0 ? ((returnDays.get(key)?.size ?? 0) / invoicesThatDay) * 100 : 0;
    returnDaily.push({ day: DAY_NAMES[dateObj.getUTCDay()], returnRate: Number(rate.toFixed(1)) });
  }
  const refundedSharePct =
    count30 > 0 ? Number(((returnedInvoiceKeys30.size / count30) * 100).toFixed(1)) : 0;

  // ── Conversión de cotizaciones (histórico del inquilino) ──
  const totalQuotes = quotes.length;
  const convertedQuotes = quotes.filter((quote) => quote.status === 'converted').length;
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
