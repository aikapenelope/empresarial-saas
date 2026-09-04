import type { PayloadRequest } from 'payload';
import { sql } from '@payloadcms/db-postgres';
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

  await req.payload.update({
    collection: 'products',
    id: productId,
    data: {
      currentStock: roundedStock,
    },
    req,
    context: {
      ...req.context,
      skipInventoryRecalculation: true,
    },
  });

  return roundedStock;
}

export interface CompleteProductionOrderOptions {
  orderId: number | string;
  quantityProduced: number;
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

  const order = await req.payload.findByID({
    collection: 'production-orders',
    id: orderId,
    depth: 2,
    req,
    context: {
      ...req.context,
      skipInventoryRecalculation: true,
    },
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

  const db = getActiveDb(req);

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
            context: { ...req.context, skipInventoryRecalculation: true },
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

  // Create immutable consumption movements
  for (const plan of consumptionPlan) {
    await req.payload.create({
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
    });

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
    context: { ...req.context, skipInventoryRecalculation: true },
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
  await req.payload.create({
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
  });

  // Update finished product stock & weighted average cost
  await req.payload.update({
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
  });

  await recalculateProductTotalStock(finishedProductId, req);

  return {
    totalBatchCostUSD,
    unitCostUSD: batchUnitCostUSD,
  };
}
