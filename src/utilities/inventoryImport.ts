import type { PayloadRequest } from 'payload';
import { extractId, getProductWarehouseStock, lockStockBalances } from './inventoryLedger';
import { runIsolatedContext } from './requestContext';
import type { Product, Warehouse } from '@/payload-types';

export type StockImportMode = 'adjust' | 'set';

export interface StockImportRow {
  sku: string;
  quantity: number;
}

export interface StockImportRowResult {
  sku: string;
  status: 'ok' | 'error';
  movement?: 'adjustment_positive' | 'adjustment_negative' | 'none';
  quantity?: number;
  message?: string;
}

export interface StockImportSummary {
  movementsCreated: number;
  rowsProcessed: number;
  results: StockImportRowResult[];
}

/**
 * Carga masiva de existencias por Kardex (única vía legítima para alterar stock).
 *
 * Semántica:
 *  - `adjust`: cada fila es un DELTA con signo (positivo = entrada, negativo = salida).
 *  - `set`: cada fila fija la existencia ABSOLUTA del producto en el almacén;
 *    se calcula el delta contra el stock vigente de ese almacén.
 *
 * Las filas se agregan por SKU antes de mover un solo movimiento: si el mismo SKU
 * aparece varias veces, el efecto neto se consolida en UN movimiento (ledger limpio).
 * Toda fila cuyo resultado dejaría el almacén con stock negativo se rechaza con error
 * por fila; las válidas se crean en la misma transacción del llamador (req propagado)
 * y el hook `afterChangeStockMovement` recalcula `currentStock` por producto.
 */
export async function importStockToWarehouse({
  tenantId,
  warehouseId,
  mode,
  rows,
  req,
}: {
  tenantId: number;
  warehouseId: number;
  mode: StockImportMode;
  rows: StockImportRow[];
  req: PayloadRequest;
}): Promise<StockImportSummary> {
  const results: StockImportRowResult[] = [];

  // 1. Validar almacén del inquilino y activo
  const warehouse = (await req.payload.findByID({
    collection: 'warehouses',
    id: warehouseId,
    depth: 0,
    req,
    overrideAccess: true,
  })) as Warehouse | undefined;

  if (!warehouse) {
    throw new Error('El almacén indicado no existe.');
  }
  if (String(extractId(warehouse.tenant)) !== String(tenantId)) {
    throw new Error('Violación de multi-inquilino: el almacén pertenece a otro inquilino.');
  }
  if (!warehouse.isActive) {
    throw new Error('El almacén indicado está inactivo.');
  }

  // 2. Resolver productos por SKU (única consulta paginada)
  const skus = [...new Set(rows.map((r) => r.sku.trim()).filter(Boolean))];
  const productsBySku = new Map<string, Product>();

  for (let i = 0; i < skus.length; i += 200) {
    const chunk = skus.slice(i, i + 200);
    const res = await req.payload.find({
      collection: 'products',
      where: {
        and: [
          { tenant: { equals: tenantId } },
          { sku: { in: chunk } },
        ],
      },
      limit: 200,
      depth: 0,
      req,
      overrideAccess: true,
    });
    for (const doc of res.docs as Product[]) {
      productsBySku.set(doc.sku, doc);
    }
  }

  // 3. Agregar filas por SKU según el modo
  interface Aggregate {
    sku: string;
    delta: number;
    rowNumbers: number[];
    setTarget?: number;
  }
  const aggregates = new Map<string, Aggregate>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // +2: encabezado CSV 1-based
    const sku = row.sku.trim();

    if (!sku) {
      results.push({ sku: row.sku, status: 'error', message: 'SKU vacío.' });
      return;
    }
    if (!Number.isFinite(row.quantity)) {
      results.push({ sku, status: 'error', message: 'Cantidad no numérica.' });
      return;
    }

    const product = productsBySku.get(sku);
    if (!product) {
      results.push({ sku, status: 'error', message: 'SKU no encontrado en el catálogo del inquilino.' });
      return;
    }
    if (product.productType === 'service' || product.trackInventory === false) {
      results.push({ sku, status: 'error', message: `"${product.name}" no controla existencias (servicio o sin kardex).` });
      return;
    }
    if (String(extractId(product.tenant)) !== String(tenantId)) {
      results.push({ sku, status: 'error', message: 'Violación de multi-inquilino en el producto.' });
      return;
    }

    let aggregate = aggregates.get(sku);
    if (!aggregate) {
      aggregate = { sku, delta: 0, rowNumbers: [] };
      aggregates.set(sku, aggregate);
    }

    if (mode === 'adjust') {
      if (row.quantity === 0) {
        results.push({ sku, status: 'error', message: 'El delta no puede ser cero.' });
        return;
      }
      aggregate.delta += row.quantity;
    } else {
      // 'set': la última fila manda para ese SKU
      aggregate.setTarget = row.quantity;
    }
    aggregate.rowNumbers.push(rowNumber);
  });

  // 4. Validar saldos y crear movimientos (misma transacción)
  let movementsCreated = 0;

  // Orden global de locks: todos los advisory locks de saldo ANTES de cualquier
  // row lock de producto (recalculateProductTotalStock del afterChange).
  await lockStockBalances(
    [...aggregates.values()]
      .map((aggregate) => ({
        productId: productsBySku.get(aggregate.sku)?.id,
        warehouseId,
      }))
      .filter((pair) => Boolean(pair.productId)),
    req,
  );

  for (const aggregate of aggregates.values()) {
    const product = productsBySku.get(aggregate.sku);
    if (!product) continue;

    const currentStock = await getProductWarehouseStock(product.id, warehouseId, req);

    let delta: number;
    if (mode === 'set') {
      const target = Number(aggregate.setTarget ?? 0);
      delta = Number((target - currentStock).toFixed(4));
    } else {
      delta = Number(aggregate.delta.toFixed(4));
    }

    if (delta === 0) {
      results.push({
        sku: aggregate.sku,
        status: 'ok',
        movement: 'none',
        quantity: 0,
        message: 'Sin cambio neto respecto al stock vigente.',
      });
      continue;
    }

    const finalStock = Number((currentStock + delta).toFixed(4));
    if (finalStock < -0.0001) {
      results.push({
        sku: aggregate.sku,
        status: 'error',
        message: `Stock insuficiente en "${warehouse.name}": disponible ${currentStock}, resultado sería ${finalStock}.`,
      });
      continue;
    }

    const isEntry = delta > 0;
    await runIsolatedContext(req, () =>
      req.payload.create({
        collection: 'stock-movements',
      data: {
        reference: `IMPORT-${warehouse.code}`,
        movementType: isEntry ? 'adjustment_positive' : 'adjustment_negative',
        product: product.id,
        ...(isEntry
          ? { targetWarehouse: warehouseId }
          : { sourceWarehouse: warehouseId }),
        quantity: Math.abs(delta),
        unitCostUSD: Number(product.costUSD) || 0,
        totalCostUSD: Number((Math.abs(delta) * (Number(product.costUSD) || 0)).toFixed(2)),
        tenant: tenantId,
          reason:
            mode === 'set'
              ? `Ajuste por carga masiva (fijar ${Number(aggregate.setTarget ?? 0)} en ${warehouse.name})`
              : `Ajuste por carga masiva (delta ${delta > 0 ? '+' : ''}${delta} en ${warehouse.name})`,
        },
        req,
        overrideAccess: true,
        context: {
          ...req.context,
          allowInternalStockUpdate: true,
        },
      }),
    );

    movementsCreated++;
    results.push({
      sku: aggregate.sku,
      status: 'ok',
      movement: isEntry ? 'adjustment_positive' : 'adjustment_negative',
      quantity: Math.abs(delta),
      message: `${isEntry ? 'Entrada' : 'Salida'} de ${Math.abs(delta)} en ${warehouse.name}.`,
    });
  }

  return {
    movementsCreated,
    rowsProcessed: rows.length,
    results,
  };
}
