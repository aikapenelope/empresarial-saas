import type { PayloadRequest } from 'payload';
import { sql } from '@payloadcms/db-postgres';
import { runIsolatedContext } from './requestContext';
import type { BillOfMaterial, Product } from '../payload-types';

export interface WarehouseStockResult {
  productId: number | string;
  warehouseId: number | string;
  stock: number;
}

/**
 * Extracts a numeric or string ID from a potentially populated relationship field.
 */
export function extractId(value: unknown): number | string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
    return (value as { id: number | string }).id;
  }
  if (typeof value === 'number' || typeof value === 'string') {
    return value;
  }
  return null;
}

/**
 * Resolves the active database or transaction handle from Payload request.
 */
export function getActiveDb(req: PayloadRequest): {
  execute: (query: unknown) => Promise<{ rows: Array<Record<string, unknown>> }>;
} {
  const dbAdapter = req.payload.db as unknown as {
    sessions?: Record<
      string,
      { db: { execute: (q: unknown) => Promise<{ rows: Array<Record<string, unknown>> }> } }
    >;
    drizzle: { execute: (q: unknown) => Promise<{ rows: Array<Record<string, unknown>> }> };
  };

  if (req.transactionID && dbAdapter.sessions?.[req.transactionID as string]?.db) {
    return dbAdapter.sessions[req.transactionID as string].db;
  }

  return dbAdapter.drizzle;
}

/**
 * Lock transaccional del saldo de un par (producto, almacén). Serializa la
 * validación de disponibilidad + creación del movimiento de salida: dos
 * transacciones concurrentes no pueden leer el mismo saldo del kardex y
 * descargar ambos (evita inventario negativo por carrera). El lock es
 * `pg_advisory_xact_lock` — se libera en commit/rollback del llamador.
 *
 * Orden determinista: las operaciones que tocan varios pares deben adquirir
 * los locks ordenados por id de producto (ver applySaleStockDeduction y el
 * plan de consumo de producción) para evitar deadlocks.
 */
export async function lockStockBalance(
  productIdRaw: unknown,
  warehouseIdRaw: unknown,
  req: PayloadRequest,
): Promise<void> {
  const productId = extractId(productIdRaw);
  const warehouseId = extractId(warehouseIdRaw);
  if (!productId || !warehouseId) return;

  const db = getActiveDb(req);
  await db.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`stockbalance:${productId}:${warehouseId}`}))`,
  );
}

/**
 * Orden global de locks del inventario: TODOS los advisory locks de saldo
 * (producto, almacén) de una operación se adquieren ANTES de cualquier row
 * lock de producto (`recalculateProductTotalStock`). Sin este orden, ventas
 * (advisory→row) y producción/importaciones/conteos intercalando creación y
 * recálculo pueden esperar mutuamente y PostgreSQL aborta una transacción.
 *
 * Los pares se deduplican y ordenan por (producto, almacén) para que dos
 * operaciones con los mismos pares en distinto orden tampoco interbloqueen.
 * `lockStockBalance` es re-entrante dentro de la misma transacción (advisory
 * xact lock), así que el beforeValidate del Kardex puede re-adquirirlo sin
 * coste adicional.
 */
export async function lockStockBalances(
  pairs: Array<{ productId: unknown; warehouseId: unknown }>,
  req: PayloadRequest,
): Promise<void> {
  const normalized = pairs
    .map(({ productId, warehouseId }) => ({
      p: extractId(productId),
      w: extractId(warehouseId),
    }))
    .filter((pair): pair is { p: number | string; w: number | string } =>
      Boolean(pair.p) && Boolean(pair.w),
    )
    .sort((a, b) => Number(a.p) - Number(b.p) || Number(a.w) - Number(b.w));
  for (const { p, w } of normalized) {
    await lockStockBalance(p, w, req);
  }
}

/**
 * Concurrency-safe query for available stock of a product inside a specific warehouse.
 * Computes net sum of inflows minus outflows from immutable stock movements.
 */
export async function getProductWarehouseStock(
  productIdRaw: unknown,
  warehouseIdRaw: unknown,
  req: PayloadRequest,
): Promise<number> {
  const productId = extractId(productIdRaw);
  const warehouseId = extractId(warehouseIdRaw);
  if (!productId || !warehouseId) return 0;

  const db = getActiveDb(req);

  const result = await db.execute(
    sql`
      SELECT COALESCE(
        SUM(
          CASE 
            WHEN target_warehouse_id = ${warehouseId} THEN quantity 
            ELSE 0 
          END
        ) - 
        SUM(
          CASE 
            WHEN source_warehouse_id = ${warehouseId} THEN quantity 
            ELSE 0 
          END
        ), 
        0
      ) AS net_stock
      FROM stock_movements
      WHERE product_id = ${productId}
        AND (target_warehouse_id = ${warehouseId} OR source_warehouse_id = ${warehouseId})
    `,
  );

  const rawNet = result.rows?.[0]?.net_stock;
  return Number(Number(rawNet || 0).toFixed(4));
}

/**
 * Atomically recalculates total on-hand stock across all warehouses for a given product
 * and updates the product's `currentStock` column under a row lock.
 */
export async function recalculateProductTotalStock(
  productIdRaw: unknown,
  req: PayloadRequest,
): Promise<number> {
  const productId = extractId(productIdRaw);
  if (!productId) return 0;

  if (req.context?.skipInventoryRecalculation) {
    return 0;
  }

  const db = getActiveDb(req);

  // Lock product row to serialize updates
  await db.execute(
    sql`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`,
  );

  const result = await db.execute(
    sql`
      SELECT COALESCE(
        SUM(
          CASE 
            WHEN target_warehouse_id IS NOT NULL THEN quantity 
            ELSE 0 
          END
        ) - 
        SUM(
          CASE 
            WHEN source_warehouse_id IS NOT NULL THEN quantity 
            ELSE 0 
          END
        ), 
        0
      ) AS total_stock
      FROM stock_movements
      WHERE product_id = ${productId}
    `,
  );

  const rawTotal = result.rows?.[0]?.total_stock;
  const roundedStock = Number(Number(rawTotal || 0).toFixed(4));

  await runIsolatedContext(req, () =>
    req.payload.update({
      collection: 'products',
      id: productId,
      data: {
        currentStock: roundedStock,
      },
      req,
      context: {
        ...req.context,
        skipInventoryRecalculation: true,
        allowInternalStockUpdate: true,
      },
    }),
  );

  return roundedStock;
}

export interface CompleteProductionOrderOptions {
  orderId: number | string;
  quantityProduced: number;
}

/**
 * Resolves the tenant ID from input data, original doc, or active request.
 */
export function resolveTenantId(
  data: Record<string, unknown> | undefined,
  originalDoc: Record<string, unknown> | undefined,
  req: PayloadRequest,
): number | string | null {
  return (
    extractId(data?.tenant) ??
    extractId(originalDoc?.tenant) ??
    extractId((req as unknown as { tenant?: unknown }).tenant) ??
    null
  );
}

/**
 * Extracts list of tenant IDs assigned to a user.
 */
export function getUserTenantIds(user: unknown): Array<number | string> {
  if (!user || typeof user !== 'object') return [];
  const u = user as {
    tenants?: Array<{ tenant: number | string | { id: number | string } }>;
  };
  if (!Array.isArray(u.tenants)) return [];
  return u.tenants
    .map((t) => (typeof t.tenant === 'object' && t.tenant !== null ? t.tenant.id : t.tenant))
    .filter((id): id is number | string => id !== null && id !== undefined);
}

/**
 * Concurrency-safe execution of a completed production order.
 * 
 * 1. Locks all raw material product rows and finished product row sorted by ID (deadlock prevention).
 * 2. Checks available stock for each raw material in the source warehouse.
 * 3. Creates immutable stock movements for consumption and product output.
 * 4. Updates finished product weighted average cost (CPP).
 * 5. Updates on-hand stock for all affected products atomically within the caller's transaction.
 */
export async function executeProductionOrder(
  options: CompleteProductionOrderOptions,
  req: PayloadRequest,
): Promise<{ totalBatchCostUSD: number; unitCostUSD: number }> {
  const { orderId, quantityProduced } = options;

  if (quantityProduced <= 0) {
    throw new Error('La cantidad fabricada debe ser mayor a 0 para completar la orden.');
  }

  const db = getActiveDb(req);

  // Concurrency protection: Lock the production order row to serialize completions
  const lockedOrderRes = await db.execute(
    sql`SELECT id, status, total_cost_u_s_d, unit_cost_u_s_d FROM production_orders WHERE id = ${orderId} FOR UPDATE`,
  );
  const lockedOrder = lockedOrderRes.rows?.[0];
  if (!lockedOrder) {
    throw new Error(`La orden de producción ID ${orderId} no existe.`);
  }

  // Idempotency check: verify if finished goods output has already been posted for this production order
  const existingOutput = await db.execute(
    sql`SELECT id FROM stock_movements WHERE production_order_id = ${orderId} AND movement_type = 'production_output' LIMIT 1`,
  );
  if (existingOutput.rows && existingOutput.rows.length > 0) {
    return {
      totalBatchCostUSD: Number(lockedOrder.total_cost_u_s_d) || 0,
      unitCostUSD: Number(lockedOrder.unit_cost_u_s_d) || 0,
    };
  }

  const order = await req.payload.findByID({
    collection: 'production-orders',
    id: orderId,
    depth: 2,
    req,
  });

  if (!order) {
    throw new Error(`La orden de producción ID ${orderId} no existe.`);
  }

  const finishedProductId = extractId(order.product);
  const sourceWarehouseId = extractId(order.sourceWarehouse);
  const targetWarehouseId = extractId(order.targetWarehouse);
  const tenantId = extractId(order.tenant);

  if (!finishedProductId || !sourceWarehouseId || !targetWarehouseId) {
    throw new Error('La orden de producción requiere producto terminado, almacén origen y almacén destino.');
  }

  const bomDoc = order.bom;
  if (!bomDoc || typeof bomDoc !== 'object') {
    throw new Error('La orden de producción no tiene una fórmula / receta (BOM) válida asignada.');
  }

  const bom = bomDoc as BillOfMaterial;
  const bomProductId = extractId(bom.product);
  if (bomProductId && String(bomProductId) !== String(finishedProductId)) {
    throw new Error(
      `Inconsistencia: La receta (BOM) asignada produce un producto distinto (ID ${bomProductId}) al producto de la orden de producción (ID ${finishedProductId}).`,
    );
  }

  const bomOutputQty = Number(bom.outputQuantity) || 1;
  const batchMultiplier = quantityProduced / bomOutputQty;

  const bomItems = Array.isArray(bom.items) ? bom.items : [];
  if (bomItems.length === 0) {
    throw new Error('La fórmula / receta (BOM) asignada no contiene insumos registrados.');
  }

  // Collect all product IDs to lock them in ascending order to prevent deadlocks
  const allProductIds = new Set<number | string>();
  allProductIds.add(finishedProductId);

  for (const item of bomItems) {
    const rawId = extractId(item.rawMaterial);
    if (rawId) allProductIds.add(rawId);
  }

  const sortedProductIds = Array.from(allProductIds).sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { numeric: true }),
  );

  // Acquire row locks on all involved products
  for (const pid of sortedProductIds) {
    await db.execute(sql`SELECT id, current_stock, cost_u_s_d FROM products WHERE id = ${pid} FOR UPDATE`);
  }

  // Validate raw material availability in source warehouse
  let accumulatedMaterialsCostUSD = 0;
  const consumptionPlan: Array<{
    rawMaterialId: number | string;
    rawMaterialName: string;
    requiredQty: number;
    unitCostUSD: number;
    subtotalCostUSD: number;
  }> = [];

  for (const item of bomItems) {
    const rawId = extractId(item.rawMaterial);
    if (!rawId) continue;

    const baseQty = Number(item.quantity) || 0;
    const scrapFactor = (Number(item.scrapFactorPercent) || 0) / 100;
    const effectiveQty = Number((baseQty * batchMultiplier * (1 + scrapFactor)).toFixed(4));

    const currentStockInSource = await getProductWarehouseStock(rawId, sourceWarehouseId, req);

    const rawProductDoc =
      typeof item.rawMaterial === 'object' && item.rawMaterial !== null
        ? (item.rawMaterial as Product)
        : await req.payload.findByID({
            collection: 'products',
            id: rawId,
            depth: 0,
            req,
          });

    const rawName = rawProductDoc?.name || `ID ${rawId}`;
    const rawCostUSD = Number(rawProductDoc?.costUSD) || 0;

    if (currentStockInSource < effectiveQty - 0.0001) {
      throw new Error(
        `Stock insuficiente de materia prima "${rawName}" en el almacén de insumos: Disponible ${currentStockInSource}, Requerido ${effectiveQty}.`,
      );
    }

    const subtotalCostUSD = Number((effectiveQty * rawCostUSD).toFixed(2));
    accumulatedMaterialsCostUSD += subtotalCostUSD;

    consumptionPlan.push({
      rawMaterialId: rawId,
      rawMaterialName: rawName,
      requiredQty: effectiveQty,
      unitCostUSD: rawCostUSD,
      subtotalCostUSD,
    });
  }

  // Create immutable consumption movements. Orden determinista por materia
  // prima: el beforeValidate del Kardex toma un advisory lock por
  // (producto, almacén) — dos producciones concurrentes con los mismos
  // insumos en distinto orden podrían interbloquearse sin este orden.
  const orderedPlan = [...consumptionPlan].sort(
    (a, b) => Number(a.rawMaterialId) - Number(b.rawMaterialId),
  );
  // Orden global de locks: todos los advisory locks de saldo del plan ANTES de
  // cualquier row lock de producto (recalculateProductTotalStock del loop).
  await lockStockBalances(
    orderedPlan.map((plan) => ({ productId: plan.rawMaterialId, warehouseId: sourceWarehouseId })),
    req,
  );
  for (const plan of orderedPlan) {
    await runIsolatedContext(req, () =>
    req.payload.create({
      collection: 'stock-movements',
      data: {
        reference: `CONSUMO-OP-${order.orderNumber || orderId}`,
        movementType: 'production_consume',
        product: plan.rawMaterialId as number,
        sourceWarehouse: sourceWarehouseId as number,
        quantity: plan.requiredQty,
        unitCostUSD: plan.unitCostUSD,
        totalCostUSD: plan.subtotalCostUSD,
        reason: `Consumo de materias primas para orden de fabricación ${order.orderNumber || orderId}`,
        productionOrder: orderId as number,
        tenant: tenantId as number,
      },
      req,
      context: {
        ...req.context,
        skipInventoryRecalculation: true,
      },
    }),
    );

    // Update raw material total on-hand stock
    await recalculateProductTotalStock(plan.rawMaterialId, req);
  }

  // Compute total batch cost (materials + labor + indirect costs) scaled by batchMultiplier
  const laborCostUSD = Number(((Number(bom.laborCostUSD) || 0) * batchMultiplier).toFixed(2));
  const indirectCostsUSD = Number(((Number(bom.indirectCostsUSD) || 0) * batchMultiplier).toFixed(2));
  const totalBatchCostUSD = Number((accumulatedMaterialsCostUSD + laborCostUSD + indirectCostsUSD).toFixed(2));
  const batchUnitCostUSD = Number((totalBatchCostUSD / quantityProduced).toFixed(4));

  // Get current finished product state for Weighted Average Cost (CPP)
  const finishedProductDoc = await req.payload.findByID({
    collection: 'products',
    id: finishedProductId,
    depth: 0,
    req,
  });

  const priorStock = Math.max(0, Number(finishedProductDoc?.currentStock) || 0);
  const priorCostUSD = Number(finishedProductDoc?.costUSD) || 0;

  let newWeightedCostUSD = batchUnitCostUSD;
  const combinedTotalStock = priorStock + quantityProduced;
  if (combinedTotalStock > 0 && priorStock > 0) {
    newWeightedCostUSD = Number(
      ((priorStock * priorCostUSD + quantityProduced * batchUnitCostUSD) / combinedTotalStock).toFixed(4),
    );
  }

  // Create immutable production output movement
  await runIsolatedContext(req, () =>
  req.payload.create({
    collection: 'stock-movements',
    data: {
      reference: `PRODUCCION-OP-${order.orderNumber || orderId}`,
      movementType: 'production_output',
      product: finishedProductId as number,
      targetWarehouse: targetWarehouseId as number,
      quantity: quantityProduced,
      unitCostUSD: batchUnitCostUSD,
      totalCostUSD: totalBatchCostUSD,
      reason: `Ingreso de producto terminado de orden de fabricación ${order.orderNumber || orderId}`,
      productionOrder: orderId as number,
      tenant: tenantId as number,
    },
    req,
    context: {
      ...req.context,
      skipInventoryRecalculation: true,
    },
  }),
  );

  // Update finished product stock & weighted average cost
  await runIsolatedContext(req, () =>
  req.payload.update({
    collection: 'products',
    id: finishedProductId,
    data: {
      costUSD: newWeightedCostUSD,
    },
    req,
    context: {
      ...req.context,
      skipInventoryRecalculation: true,
    },
  }),
  );

  await recalculateProductTotalStock(finishedProductId, req);

  return {
    totalBatchCostUSD,
    unitCostUSD: batchUnitCostUSD,
  };
}

/**
 * Updates a product's weighted average cost (CPP) upon an inbound purchase.
 * Locks the product row in the active transaction, calculates the new weighted value
 * from pre-entry stock and purchase details, and updates costUSD.
 */
export async function updateProductWeightedCostOnPurchase(
  productIdRaw: unknown,
  purchaseQty: number,
  purchaseUnitCostUSD: number,
  req: PayloadRequest,
): Promise<number> {
  const productId = extractId(productIdRaw);
  if (!productId || purchaseQty <= 0 || purchaseUnitCostUSD <= 0) return 0;

  const db = getActiveDb(req);

  // Lock product row to serialize cost recalculations
  const lockResult = await db.execute(
    sql`SELECT id, current_stock, cost_u_s_d FROM products WHERE id = ${productId} FOR UPDATE`,
  );

  const productRow = lockResult.rows?.[0];
  if (!productRow) return 0;

  const currentStockAfter = Number(productRow.current_stock) || 0;
  const priorCostUSD = Number(productRow.cost_u_s_d) || 0;
  const preEntryStock = Math.max(0, Number((currentStockAfter - purchaseQty).toFixed(4)));

  let newWeightedCostUSD = purchaseUnitCostUSD;
  if (preEntryStock > 0 && priorCostUSD > 0) {
    const totalUnits = preEntryStock + purchaseQty;
    newWeightedCostUSD = Number(
      ((preEntryStock * priorCostUSD + purchaseQty * purchaseUnitCostUSD) / totalUnits).toFixed(4),
    );
  }

  await runIsolatedContext(req, () =>
  req.payload.update({
    collection: 'products',
    id: productId,
    data: {
      costUSD: newWeightedCostUSD,
    },
    req,
    context: {
      ...req.context,
      skipInventoryRecalculation: true,
    },
  }),
  );

  return newWeightedCostUSD;
}
