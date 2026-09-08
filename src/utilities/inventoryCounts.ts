import type { PayloadRequest } from 'payload';
import { sql } from '@payloadcms/db-postgres';
import { runIsolatedContext } from './requestContext';
import { extractId, getActiveDb, lockStockBalances } from './inventoryLedger';
import type { InventoryCount, Product } from '@/payload-types';

/**
 * Conteos cíclicos de inventario (Sprint 12). El Kardex sigue siendo la única vía
 * para alterar existencias: al completar un conteo, cada diferencia genera un
 * movimiento `adjustment_positive/negative` dentro de la transacción del llamador.
 */

export interface CountItemSnapshot {
  product: number;
  systemQty: number;
  countedQty?: number | null;
  difference?: number;
}

/** Snapshot de existencias por almacén (solo productos con control de kardex). */
export async function snapshotWarehouseStock({
  warehouseId,
  req,
}: {
  warehouseId: number;
  req: PayloadRequest;
}): Promise<CountItemSnapshot[]> {
  const db = getActiveDb(req);
  const res = await db.execute(
    sql`
      SELECT sm.product_id AS product_id,
             COALESCE(
               SUM(CASE WHEN sm.target_warehouse_id = ${warehouseId} THEN sm.quantity ELSE 0 END) -
               SUM(CASE WHEN sm.source_warehouse_id = ${warehouseId} THEN sm.quantity ELSE 0 END),
               0
             ) AS net_stock
      FROM stock_movements sm
      INNER JOIN products p ON p.id = sm.product_id
      WHERE (sm.target_warehouse_id = ${warehouseId} OR sm.source_warehouse_id = ${warehouseId})
        AND p.track_inventory = true
        AND p.product_type != 'service'
      GROUP BY sm.product_id
      ORDER BY sm.product_id ASC
    `,
  );

  return (res.rows || []).map((row) => ({
    product: Number(row.product_id),
    systemQty: Number(Number(row.net_stock || 0).toFixed(4)),
    countedQty: null,
  }));
}

/**
 * Completa un conteo: valida que esté en progreso, crea un movimiento de ajuste
 * por cada línea con diferencia distinta de cero (agregada por producto) y marca
 * el conteo como completado. Todo en la transacción del llamador (req propagado).
 */
export async function completeInventoryCount({
  count,
  completedBy,
  req,
}: {
  count: InventoryCount;
  completedBy: number;
  req: PayloadRequest;
}): Promise<number> {
  const warehouseIdRaw = extractId(count.warehouse);
  if (!warehouseIdRaw) {
    throw new Error('El conteo no tiene un almacén válido.');
  }
  const warehouseId = Number(warehouseIdRaw);

  if (count.status === 'completed') {
    throw new Error('El conteo ya está completado.');
  }

  const items = (Array.isArray(count.items) ? count.items : []) as Array<{
    product?: unknown;
    countedQty?: number | null;
    systemQty?: number | null;
  }>;

  // Agregar diferencias por producto (un solo movimiento por producto)
  const deltas = new Map<number, number>();
  for (const item of items) {
    const productId = Number(extractId(item.product));
    if (!productId) continue;
    if (item.countedQty === null || item.countedQty === undefined) continue; // no contado: sin ajuste

    const counted = Number(item.countedQty);
    const system = Number(item.systemQty) || 0;
    const delta = Number((counted - system).toFixed(4));
    if (delta === 0) continue;

    deltas.set(productId, Number(((deltas.get(productId) || 0) + delta).toFixed(4)));
  }

  const tenantId = Number(extractId(count.tenant));

  // Orden global de locks: todos los advisory locks de saldo ANTES de cualquier
  // row lock de producto (recalculateProductTotalStock del afterChange).
  await lockStockBalances(
    [...deltas.keys()].map((productId) => ({ productId, warehouseId })),
    req,
  );

  for (const [productId, delta] of deltas.entries()) {
    const product = (await req.payload.findByID({
      collection: 'products',
      id: productId,
      depth: 0,
      req,
      overrideAccess: true,
    })) as Product | undefined;

    if (!product) {
      throw new Error(`El producto ID ${productId} del conteo no existe.`);
    }

    const unitCost = Number(product.costUSD) || 0;
    const isEntry = delta > 0;

    await runIsolatedContext(req, () =>
      req.payload.create({
        collection: 'stock-movements',
        data: {
          reference: `CONTEO-${count.id}`,
        movementType: isEntry ? 'adjustment_positive' : 'adjustment_negative',
        product: productId,
        ...(isEntry
          ? { targetWarehouse: Number(warehouseId) }
          : { sourceWarehouse: Number(warehouseId) }),
        quantity: Math.abs(delta),
        unitCostUSD: unitCost,
        totalCostUSD: Number((Math.abs(delta) * unitCost).toFixed(2)),
        tenant: tenantId as number,
          reason: `Ajuste por conteo cíclico #${count.id} en ${warehouseId}`,
        },
        req,
        overrideAccess: true,
        context: {
          ...req.context,
          allowInternalStockUpdate: true,
        },
      }),
    );
  }

  await req.payload.update({
    collection: 'inventory-counts',
    id: count.id,
    data: {
      status: 'completed',
      completedAt: new Date().toISOString(),
      completedBy,
    },
    req,
    overrideAccess: true,
  });

  return deltas.size;
}
