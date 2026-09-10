import type { Payload, PayloadRequest } from 'payload';

/**
 * Evaluador de alertas (Sprint 22). Lógica de negocio pura de Payload Local
 * API; el TaskConfig `evaluateAlerts` (cron cada 15 min) la invoca por
 * inquilino. Corre como tarea de sistema con overrideAccess — patrón oficial
 * para jobs (skill de Payload).
 *
 * Idempotencia estructural: cada condición tiene clave (type, refId) y la
 * colección tiene índice único (tenant, type, refId). Una condición activa
 * actualiza su mensaje; una condición resuelta se REACTIVA si reaparece; una
 * condición que ya no aplica se resuelve (resolvedAt = ahora).
 */

export type AlertType =
  | 'low_stock'
  | 'inventory_diff'
  | 'rate_change'
  | 'overdue_invoice'
  | 'vendor_overdue'
  | 'overdue_installment';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface ComputedAlert {
  type: AlertType;
  refCollection: string;
  refId: number;
  severity: AlertSeverity;
  message: string;
}

export interface AlertEvaluationResult {
  created: number;
  updated: number;
  resolved: number;
  /** Condiciones reactivadas tras haber estado resueltas: disparan notificación. */
  reactivated: number;
}

/** Umbral de variación de tasa (en %) que dispara la alerta. */
const RATE_CHANGE_THRESHOLD_PCT = 5;
const EPS = 0.0001;

function keyOf(type: AlertType, refId: number): string {
  return `${type}:${refId}`;
}

/** Evalúa todas las condiciones de un inquilino y sincroniza la colección alerts. */
export async function evaluateAlertsForTenant(
  payload: Payload,
  tenantId: number,
  req: PayloadRequest,
): Promise<AlertEvaluationResult> {
  const computed = new Map<string, ComputedAlert>();
  const asOf = Date.now();
  const DAY_MS = 1000 * 60 * 60 * 24;

  // ── 1. Stock bajo (productos físicos con trackInventory) ──────────────────
  const productsRes = await payload.find({
    collection: 'products',
    where: { tenant: { equals: tenantId } },
    pagination: false,
    depth: 0,
    req,
  });
  for (const p of productsRes.docs) {
    if (p.productType === 'service' || p.trackInventory === false) continue;
    const min = Number(p.minStockAlert) || 0;
    if (min <= 0) continue;
    const stock = Number(p.currentStock) || 0;
    if (stock > min) continue;
    computed.set(keyOf('low_stock', p.id), {
      type: 'low_stock',
      refCollection: 'products',
      refId: p.id,
      severity: stock <= 0 ? 'critical' : 'warning',
      message:
        stock <= 0
          ? `Sin existencias: "${p.name}" (${p.sku}) llegó a 0 unidades (mínimo ${min}).`
          : `Stock bajo: "${p.name}" (${p.sku}) tiene ${stock} u. y el mínimo es ${min}.`,
    });
  }

  // ── 2. Conteos cíclicos en progreso con diferencias capturadas ────────────
  const countsRes = await payload.find({
    collection: 'inventory-counts',
    where: {
      and: [{ tenant: { equals: tenantId } }, { status: { equals: 'in_progress' } }],
    },
    pagination: false,
    depth: 0,
    req,
  });
  for (const count of countsRes.docs) {
    const hasDiff = (Array.isArray(count.items) ? count.items : []).some((it) => {
      if (it.countedQty === null || it.countedQty === undefined) return false;
      return Math.abs((Number(it.countedQty) || 0) - (Number(it.systemQty) || 0)) > EPS;
    });
    if (!hasDiff) continue;
    computed.set(keyOf('inventory_diff', count.id), {
      type: 'inventory_diff',
      refCollection: 'inventory-counts',
      refId: count.id,
      severity: 'info',
      message: `El conteo #${count.id} tiene diferencias capturadas pendientes de aplicar.`,
    });
  }

  // ── 3. Facturas vencidas sin saldar ───────────────────────────────────────
  const invoicesRes = await payload.find({
    collection: 'invoices',
    where: {
      and: [
        { tenant: { equals: tenantId } },
        { status: { in: ['issued', 'partially_paid'] } },
      ],
    },
    pagination: false,
    depth: 1,
    req,
  });
  // Mapa cliente → vendedor para el canal con cartera vencida
  const customersRes = await payload.find({
    collection: 'customers',
    where: { tenant: { equals: tenantId } },
    pagination: false,
    depth: 0,
    req,
  });
  const vendorByCustomer = new Map<number, number | null>(
    customersRes.docs.map((c) => [
      c.id,
      c.assignedVendor
        ? typeof c.assignedVendor === 'object'
          ? c.assignedVendor.id
          : Number(c.assignedVendor)
        : null,
    ]),
  );
  const vendorOverdue = new Map<number, { count: number; totalUSD: number }>();

  for (const inv of invoicesRes.docs) {
    // ── 3b. Cuotas vencidas (IE-PR4): la cuota impaga más antigua vencida de
    // la factura genera su propia alerta (refId = factura; convive con
    // overdue_invoice gracias al índice único tenant+type+refId).
    const installments = Array.isArray(inv.installments) ? inv.installments : [];
    const oldestOverdue = installments
      .filter((it) => it.status !== 'paid')
      .map((it) => ({ it, due: new Date(it.dueDate).getTime() }))
      .filter(({ due }) => !Number.isNaN(due) && asOf - due > 0)
      .sort((a, b) => a.due - b.due)[0];
    if (oldestOverdue) {
      const daysOver = Math.floor((asOf - oldestOverdue.due) / DAY_MS);
      const pending = Math.max(
        oldestOverdue.it.amountUSD - (Number(oldestOverdue.it.paidUSD) || 0),
        0,
      );
      computed.set(keyOf('overdue_installment', inv.id), {
        type: 'overdue_installment',
        refCollection: 'invoices',
        refId: inv.id,
        severity: daysOver > 30 ? 'critical' : 'warning',
        message: `Factura ${inv.invoiceNumber}: cuota ${oldestOverdue.it.number} vencida hace ${daysOver} día(s) con ${pending.toFixed(2)} USD pendientes.`,
      });
    }

    const balance = Number(inv.balanceUSD) || 0;
    if (balance <= 0 || !inv.dueDate) continue;
    const due = new Date(inv.dueDate).getTime();
    if (Number.isNaN(due)) continue;
    const daysOverdue = Math.floor((asOf - due) / DAY_MS);
    if (daysOverdue <= 0) continue;

    computed.set(keyOf('overdue_invoice', inv.id), {
      type: 'overdue_invoice',
      refCollection: 'invoices',
      refId: inv.id,
      severity: daysOverdue > 30 ? 'critical' : 'warning',
      message: `Factura ${inv.invoiceNumber} vencida hace ${daysOverdue} día(s): saldo ${balance.toFixed(2)} USD.`,
    });

    const customerId =
      typeof inv.customer === 'object' && inv.customer !== null ? inv.customer.id : Number(inv.customer);
    const vendorId = vendorByCustomer.get(customerId) ?? null;
    if (vendorId) {
      const agg = vendorOverdue.get(vendorId) || { count: 0, totalUSD: 0 };
      agg.count += 1;
      agg.totalUSD += balance;
      vendorOverdue.set(vendorId, agg);
    }
  }

  // ── 4. Canal con cartera vencida (proxy de meta: vendedor con vencidos) ───
  // El modelo Cendaro usa "meta del mes"; aquí no existe modelo de metas, así
  // que la alerta del canal se basa en cartera vencida asignada al vendedor.
  for (const [vendorId, agg] of vendorOverdue.entries()) {
    computed.set(keyOf('vendor_overdue', vendorId), {
      type: 'vendor_overdue',
      refCollection: 'users',
      refId: vendorId,
      severity: agg.totalUSD > 1000 ? 'warning' : 'info',
      message: `El vendedor #${vendorId} tiene cartera vencida: ${agg.count} factura(s) por ${agg.totalUSD.toFixed(2)} USD.`,
    });
  }

  // ── 5. Variación de tasa vs último snapshot facturado ─────────────────────
  const tenant = await payload.findByID({
    collection: 'tenants',
    id: tenantId,
    depth: 0,
    req,
  });
  const autoSync = tenant.currencyConfig?.autoSyncRate !== false;
  if (autoSync) {
    const lastInvoiced = invoicesRes.docs
      .filter((inv) => Number(inv.exchangeRateSnapshot) > 0)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    if (lastInvoiced) {
      const { resolveEffectiveRate } = await import('./exchangeRate');
      const effective = await resolveEffectiveRate(
        tenant.currencyConfig
          ? {
              manualExchangeRate: tenant.currencyConfig.manualExchangeRate ?? undefined,
              autoSyncRate: tenant.currencyConfig.autoSyncRate ?? undefined,
            }
          : undefined,
      );
      const last = Number(lastInvoiced.exchangeRateSnapshot);
      if (last > 0 && Math.abs(effective.rate - last) / last >= RATE_CHANGE_THRESHOLD_PCT / 100) {
        computed.set(keyOf('rate_change', 0), {
          type: 'rate_change',
          refCollection: 'tenants',
          refId: 0,
          severity: 'info',
          message: `La tasa vigente (${effective.rate.toFixed(4)}) varió más de ${RATE_CHANGE_THRESHOLD_PCT}% respecto al último snapshot facturado (${last.toFixed(4)}).`,
        });
      }
    }
  }

  // ── Sincronización idempotente con la colección alerts ────────────────────
  const existingRes = await payload.find({
    collection: 'alerts',
    where: { tenant: { equals: tenantId } },
    pagination: false,
    depth: 0,
    req,
  });
  const existingByKey = new Map<string, (typeof existingRes.docs)[number]>(
    existingRes.docs.map((a) => [keyOf(a.type as AlertType, Number(a.refId) || 0), a]),
  );

  let created = 0;
  let updated = 0;
  let resolved = 0;
  let reactivated = 0;

  for (const [key, alert] of computed.entries()) {
    const existing = existingByKey.get(key);
    if (!existing) {
      await payload.create({
        collection: 'alerts',
        data: {
          tenant: tenantId,
          type: alert.type,
          severity: alert.severity,
          message: alert.message,
          refCollection: alert.refCollection,
          refId: alert.refId,
        },
        req,
      });
      created += 1;
    } else {
      const isResolved = Boolean(existing.resolvedAt);
      const messageChanged = existing.message !== alert.message;
      if (isResolved || messageChanged || existing.severity !== alert.severity) {
        await payload.update({
          collection: 'alerts',
          id: existing.id,
          data: {
            message: alert.message,
            severity: alert.severity,
            ...(isResolved ? { resolvedAt: null } : {}),
          },
          req,
        });
        updated += 1;
        if (isResolved) reactivated += 1;
      }
    }
  }

  // Condiciones que ya no aplican → resolver (sólo las activas)
  for (const [key, existing] of existingByKey.entries()) {
    if (existing.resolvedAt) continue;
    if (!computed.has(key)) {
      await payload.update({
        collection: 'alerts',
        id: existing.id,
        data: { resolvedAt: new Date().toISOString() },
        req,
      });
      resolved += 1;
    }
  }

  return { created, updated, resolved, reactivated };
}
