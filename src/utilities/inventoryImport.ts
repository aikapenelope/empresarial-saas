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

/** Agregado neto de un SKU dentro de una importación. */
export interface StockRowAggregate {
  sku: string;
  delta: number;
  rowNumbers: number[];
  /** Modo `set`: existencia absoluta pedida (la última fila manda). */
  setTarget?: number;
}

export interface AggregateResult {
  aggregates: Map<string, StockRowAggregate>;
  rowErrors: StockImportRowResult[];
}

/**
 * Agregación PURA de filas (IE-PR7): consolida por SKU y valida lo validable
 * sin tocar la BD — vacíos, no numéricos, delta cero en `adjust`. Testeable en
 * CI. Extraída byte-idéntica de la fase de agregación que corrió en producción
 * desde el Sprint 22 (mismos mensajes, mismo orden, `rowNumber` = fila CSV
 * 1-based con encabezado).
 */
export function aggregateStockRows(rows: StockImportRow[], mode: StockImportMode): AggregateResult {
  const aggregates = new Map<string, StockRowAggregate>();
  const rowErrors: StockImportRowResult[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // +2: encabezado CSV 1-based
    const sku = row.sku.trim();

    if (!sku) {
      rowErrors.push({ sku: row.sku, status: 'error', message: 'SKU vacío.' });
      return;
    }
    if (!Number.isFinite(row.quantity)) {
      rowErrors.push({ sku, status: 'error', message: 'Cantidad no numérica.' });
      return;
    }

    let aggregate = aggregates.get(sku);
    if (!aggregate) {
      aggregate = { sku, delta: 0, rowNumbers: [] };
      aggregates.set(sku, aggregate);
    }

    if (mode === 'adjust') {
      if (row.quantity === 0) {
        // Devin #84: un agregado recién creado y rechazado no debe quedar en el
        // mapa — decidiría un movimiento "sin cambio neto" contradictorio con
        // el error del dry-run. Si ya tenía filas aceptadas, se conserva.
        if (aggregate.rowNumbers.length === 0) aggregates.delete(sku);
        rowErrors.push({ sku, status: 'error', message: 'El delta no puede ser cero.' });
        return;
      }
      aggregate.delta += row.quantity;
    } else {
      // 'set': la última fila manda para ese SKU
      aggregate.setTarget = row.quantity;
    }
    aggregate.rowNumbers.push(rowNumber);
  });

  return { aggregates, rowErrors };
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
 *
 * IE-PR7 (wizard con dry-run): el flujo se divide en PLANEADOR + EJECUCIÓN.
 * `planStockImport` hace TODAS las validaciones/lecturas SIN escribir (locks ni
 * movimientos) y devuelve el plan para el dry-run del wizard. El commit
 * (`importStockToWarehouse`) conserva el ORDEN EXACTO del original: locks de
 * saldo → lectura de stock → decisiones → creación, todo dentro de la
 * transacción del llamador — y el plan se recalcula en el momento, así que el
 * resultado aplicado siempre refleja el stock vigente al confirmar.
 */

/** Movimiento propuesto por el planeador, listo para crearse en el Kardex. */
export interface PlannedStockMovement {
  sku: string;
  productId: number;
  movementType: 'adjustment_positive' | 'adjustment_negative';
  quantity: number;
  unitCostUSD: number;
  totalCostUSD: number;
  reason: string;
}

export interface StockImportPlan {
  warehouse: { id: number; name: string; code: string };
  /** Errores por fila (orden de fila) + resultado por SKU agregado (orden del Map). */
  results: StockImportRowResult[];
  /** Movimientos que se crearían — vacío si nada que escribir. */
  movements: PlannedStockMovement[];
  /** IDs de producto en el MISMO orden que los agregados (para el orden de locks). */
  productIds: number[];
  rowsProcessed: number;
}

/** Fase 1 (común a preview y commit): almacén + catálogo + agregación pura. */
interface ImportBlueprint {
  warehouse: Warehouse;
  productsBySku: Map<string, Product>;
  aggregates: Map<string, StockRowAggregate>;
  /** Sólo errores por fila en orden de fila; los resultados por SKU llegan después. */
  results: StockImportRowResult[];
  rowsProcessed: number;
}

async function buildImportBlueprint({
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
}): Promise<ImportBlueprint> {
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

  // 3. Agregar filas por SKU según el modo (función pura, IE-PR7)
  const { aggregates, rowErrors } = aggregateStockRows(rows, mode);

  return {
    warehouse,
    productsBySku,
    aggregates,
    results: [...rowErrors],
    rowsProcessed: rows.length,
  };
}

/**
 * Fase 2: lee el stock vigente por SKU agregado y decide — sin cambio neto
 * (ok/none), stock insuficiente (error) o movimiento propuesto. Empuja los
 * resultados por SKU a `blueprint.results` (después de los errores por fila,
 * mismo orden del flujo original).
 */
async function decideStockMovements(
  blueprint: ImportBlueprint,
  {
    tenantId,
    warehouseId,
    mode,
    req,
  }: {
    tenantId: number;
    warehouseId: number;
    mode: StockImportMode;
    req: PayloadRequest;
  },
): Promise<PlannedStockMovement[]> {
  const movements: PlannedStockMovement[] = [];

  for (const aggregate of blueprint.aggregates.values()) {
    const product = blueprint.productsBySku.get(aggregate.sku);
    if (!product) {
      // Devin #84: los SKUs desconocidos NUNCA se omiten en silencio — fila de
      // error explícita (regresión introducida por la extracción del planeador).
      blueprint.results.push({
        sku: aggregate.sku,
        status: 'error',
        message: 'SKU no encontrado en el catálogo del inquilino.',
      });
      continue;
    }
    if (product.productType === 'service' || product.trackInventory === false) {
      blueprint.results.push({
        sku: aggregate.sku,
        status: 'error',
        message: `"${product.name}" no controla existencias (servicio o sin kardex).`,
      });
      continue;
    }
    if (String(extractId(product.tenant)) !== String(tenantId)) {
      blueprint.results.push({
        sku: aggregate.sku,
        status: 'error',
        message: 'Violación de multi-inquilino en el producto.',
      });
      continue;
    }

    const currentStock = await getProductWarehouseStock(product.id, warehouseId, req);

    let delta: number;
    if (mode === 'set') {
      const target = Number(aggregate.setTarget ?? 0);
      delta = Number((target - currentStock).toFixed(4));
    } else {
      delta = Number(aggregate.delta.toFixed(4));
    }

    if (delta === 0) {
      blueprint.results.push({
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
      blueprint.results.push({
        sku: aggregate.sku,
        status: 'error',
        message: `Stock insuficiente en "${blueprint.warehouse.name}": disponible ${currentStock}, resultado sería ${finalStock}.`,
      });
      continue;
    }

    const isEntry = delta > 0;
    movements.push({
      sku: aggregate.sku,
      productId: product.id,
      movementType: isEntry ? 'adjustment_positive' : 'adjustment_negative',
      quantity: Math.abs(delta),
      unitCostUSD: Number(product.costUSD) || 0,
      totalCostUSD: Number((Math.abs(delta) * (Number(product.costUSD) || 0)).toFixed(2)),
      reason:
        mode === 'set'
          ? `Ajuste por carga masiva (fijar ${Number(aggregate.setTarget ?? 0)} en ${blueprint.warehouse.name})`
          : `Ajuste por carga masiva (delta ${delta > 0 ? '+' : ''}${delta} en ${blueprint.warehouse.name})`,
    });
    blueprint.results.push({
      sku: aggregate.sku,
      status: 'ok',
      movement: isEntry ? 'adjustment_positive' : 'adjustment_negative',
      quantity: Math.abs(delta),
      message: `${isEntry ? 'Entrada' : 'Salida'} de ${Math.abs(delta)} en ${blueprint.warehouse.name}.`,
    });
  }
  return movements;
}

/**
 * DRY-RUN (IE-PR7): plan completo SIN locks NI escrituras. La acción
 * `previewStockImportAction` lo expone read-only para el paso 3 del wizard.
 */
export async function planStockImport({
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
}): Promise<StockImportPlan> {
  const blueprint = await buildImportBlueprint({ tenantId, warehouseId, mode, rows, req });
  const movements = await decideStockMovements(blueprint, {
    tenantId,
    warehouseId,
    mode,
    req,
  });

  const productIds: number[] = [];
  for (const aggregate of blueprint.aggregates.values()) {
    const product = blueprint.productsBySku.get(aggregate.sku);
    if (product) productIds.push(product.id);
  }

  return {
    warehouse: {
      id: warehouseId,
      name: blueprint.warehouse.name,
      code: blueprint.warehouse.code,
    },
    results: blueprint.results,
    movements,
    productIds,
    rowsProcessed: blueprint.rowsProcessed,
  };
}

/**
 * COMMIT (la vía que escribe): orden EXACTO del flujo original — locks de
 * saldo ANTES de leer el stock (atomicidad del check-then-write), decisiones
 * y creación de movimientos en la transacción del llamador. El plan se
 * calcula fresco: el resultado aplicado refleja el stock vigente al confirmar.
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
  const blueprint = await buildImportBlueprint({ tenantId, warehouseId, mode, rows, req });

  // Orden global de locks: todos los advisory locks de saldo ANTES de cualquier
  // row lock de producto (recalculateProductTotalStock del afterChange).
  await lockStockBalances(
    [...blueprint.aggregates.values()]
      .map((aggregate) => ({
        productId: blueprint.productsBySku.get(aggregate.sku)?.id,
        warehouseId,
      }))
      .filter((pair) => Boolean(pair.productId)),
    req,
  );

  const movements = await decideStockMovements(blueprint, {
    tenantId,
    warehouseId,
    mode,
    req,
  });

  for (const movement of movements) {
    await runIsolatedContext(req, () =>
      req.payload.create({
        collection: 'stock-movements',
        data: {
          reference: `IMPORT-${blueprint.warehouse.code}`,
          movementType: movement.movementType,
          product: movement.productId,
          ...(movement.movementType === 'adjustment_positive'
            ? { targetWarehouse: warehouseId }
            : { sourceWarehouse: warehouseId }),
          quantity: movement.quantity,
          unitCostUSD: movement.unitCostUSD,
          totalCostUSD: movement.totalCostUSD,
          tenant: tenantId,
          reason: movement.reason,
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

  return {
    movementsCreated: movements.length,
    rowsProcessed: blueprint.rowsProcessed,
    results: blueprint.results,
  };
}
