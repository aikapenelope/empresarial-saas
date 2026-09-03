import type { PayloadRequest } from 'payload';

export interface ExecuteProductionOrderArgs {
  orderDoc: any;
  req: PayloadRequest;
}

/**
 * Ejecución transaccional atómica de una Orden de Fabricación finalizada.
 * 
 * Cumple con AGENTS.md:
 * 1. Descuenta materias primas del Kardex (movimiento negativo 'raw_material_consumption').
 * 2. Ingresa producto terminado al Kardex (movimiento positivo 'production_receipt').
 * 3. Recalcula el costo promedio ponderado real del producto terminado.
 * 4. Pasa `{ req }` para garantizar atomicidad dentro de la transacción.
 */
export async function executeProductionOrderCompletion({
  orderDoc,
  req,
}: ExecuteProductionOrderArgs): Promise<void> {
  const producedQty = Number(orderDoc.producedQuantity) || Number(orderDoc.plannedQuantity) || 0;
  if (producedQty <= 0) return;

  const bomId = typeof orderDoc.bom === 'object' && orderDoc.bom !== null
    ? orderDoc.bom.id
    : orderDoc.bom;

  const finishedProductId = typeof orderDoc.finishedProduct === 'object' && orderDoc.finishedProduct !== null
    ? orderDoc.finishedProduct.id
    : orderDoc.finishedProduct;

  const sourceWarehouseId = typeof orderDoc.sourceWarehouse === 'object' && orderDoc.sourceWarehouse !== null
    ? orderDoc.sourceWarehouse.id
    : orderDoc.sourceWarehouse;

  const targetWarehouseId = typeof orderDoc.targetWarehouse === 'object' && orderDoc.targetWarehouse !== null
    ? orderDoc.targetWarehouse.id
    : orderDoc.targetWarehouse;

  if (!bomId || !finishedProductId || !sourceWarehouseId || !targetWarehouseId) {
    req.payload.logger.error(`Orden ${orderDoc.orderNumber} incompleta: falta BOM, producto terminado o almacenes.`);
    return;
  }

  // 1. Obtener datos completos de la fórmula BOM
  const bom = await req.payload.findByID({
    collection: 'bill-of-materials',
    id: String(bomId),
    depth: 1,
    req,
  });

  if (!bom) return;

  const yieldQty = Math.max(1, Number(bom.yieldQuantity) || 1);
  const scale = producedQty / yieldQty;

  let totalRawConsumedCost = 0;

  // 2. Consumo de cada materia prima / componente
  if (Array.isArray(bom.components)) {
    for (const comp of bom.components) {
      const rawId = typeof comp.rawMaterial === 'object' && comp.rawMaterial !== null
        ? comp.rawMaterial.id
        : comp.rawMaterial;

      const baseQty = Number(comp.quantity) || 0;
      const scrap = Number(comp.scrapPercentage) || 0;
      const unitCost = Number(comp.unitCostSnapshot) || 0;

      const requiredQty = baseQty * scale * (1 + scrap / 100);
      const roundedQty = Math.round(requiredQty * 1000) / 1000;
      const compCost = Math.round(roundedQty * unitCost * 100) / 100;
      totalRawConsumedCost += compCost;

      // Registrar salida en Kardex (cantidad negativa)
      await req.payload.create({
        collection: 'stock-movements',
        data: {
          product: rawId,
          warehouse: sourceWarehouseId,
          movementType: 'raw_material_consumption',
          quantity: -roundedQty,
          unitCostUSD: unitCost,
          reference: orderDoc.orderNumber,
          movementDate: orderDoc.completedDate || new Date().toISOString(),
          notes: `Consumo en OP ${orderDoc.orderNumber} (${producedQty} ${bom.yieldUnit} terminadas)`,
        },
        req,
      });
    }
  }

  // 3. Calcular costo real total del lote y costo unitario
  const laborTotal = Math.round((Number(bom.costs?.laborCostUSD) || 0) * scale * 100) / 100;
  const overheadTotal = Math.round((Number(bom.costs?.overheadCostUSD) || 0) * scale * 100) / 100;
  const realBatchCost = Math.round((totalRawConsumedCost + laborTotal + overheadTotal) * 100) / 100;
  const realUnitCost = Math.round((realBatchCost / producedQty) * 1000) / 1000;

  // 4. Ingresar producto terminado en Kardex
  await req.payload.create({
    collection: 'stock-movements',
    data: {
      product: finishedProductId,
      warehouse: targetWarehouseId,
      movementType: 'production_receipt',
      quantity: producedQty,
      unitCostUSD: realUnitCost,
      reference: orderDoc.orderNumber,
      movementDate: orderDoc.completedDate || new Date().toISOString(),
      notes: `Entrada por orden de producción finalizada ${orderDoc.orderNumber}`,
    },
    req,
  });

  // 5. Actualizar costo promedio ponderado del producto terminado
  try {
    const finishedProduct = await req.payload.findByID({
      collection: 'products',
      id: String(finishedProductId),
      depth: 0,
      req,
    });

    if (finishedProduct) {
      const currentStock = Number(finishedProduct.inventory?.stockQuantity) || 0;
      const currentAvgCost = Number(finishedProduct.pricing?.averageCostUSD) || Number(finishedProduct.pricing?.costPriceUSD) || 0;

      // Costo Promedio Ponderado: (StockActual * CostoActual + NuevoStock * NuevoCosto) / (StockActual + NuevoStock)
      const totalUnits = currentStock + producedQty;
      const newAverageCost = totalUnits > 0
        ? Math.round(((currentStock * currentAvgCost + producedQty * realUnitCost) / totalUnits) * 1000) / 1000
        : realUnitCost;

      await req.payload.update({
        collection: 'products',
        id: String(finishedProductId),
        data: {
          pricing: {
            ...finishedProduct.pricing,
            averageCostUSD: newAverageCost,
          },
        },
        req,
        overrideAccess: true,
      });
    }
  } catch (err) {
    req.payload.logger.error({ err }, `Error updating average cost for finished product ${finishedProductId}`);
  }

  // 6. Persistir costos reales en la orden de producción
  await req.payload.update({
    collection: 'production-orders',
    id: String(orderDoc.id),
    data: {
      actualCosts: {
        actualTotalCostUSD: realBatchCost,
        actualUnitCostUSD: realUnitCost,
      },
      completedDate: orderDoc.completedDate || new Date().toISOString(),
    },
    req,
    context: {
      ...req.context,
      skipProductionExecution: true,
    },
    overrideAccess: true,
  });
}
