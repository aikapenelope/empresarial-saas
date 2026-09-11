import type { PayloadRequest } from 'payload';
import { sql } from '@payloadcms/db-postgres';
import { runIsolatedContext } from './requestContext';
import { extractId, getActiveDb, lockStockBalances } from './inventoryLedger';
import type { Invoice, Product, Warehouse } from '@/payload-types';

// Estados de factura que comprometen inventario: los borradores y anulados no descargan.
const STOCK_COMMITTING_STATUSES = ['issued', 'partially_paid', 'paid'] as const;

interface InvoiceLineWithProduct {
  product: number;
  quantity: number;
}

/**
 * Resuelve el almacén de despacho de una venta: el almacén indicado en la factura,
 * o el almacén activo marcado por defecto del inquilino, o el primer almacén activo.
 * Lanza si el inquilino no tiene ningún almacén activo.
 */
async function resolveDispatchWarehouse(
  invoice: Invoice,
  req: PayloadRequest,
): Promise<number> {
  const explicitWarehouse = extractId(invoice.warehouse);
  if (explicitWarehouse) {
    return Number(explicitWarehouse);
  }

  const tenantId = extractId(invoice.tenant);
  const warehouses = await req.payload.find({
    collection: 'warehouses',
    where: {
      and: [
        { tenant: { equals: tenantId as number } },
        { isActive: { equals: true } },
      ],
    },
    sort: '-isDefault',
    limit: 1,
    depth: 0,
    req,
    overrideAccess: true,
  });

  const warehouse = warehouses.docs[0] as Warehouse | undefined;
  if (!warehouse) {
    throw new Error(
      `La factura ${invoice.invoiceNumber} no tiene almacén de despacho y el inquilino no tiene almacenes activos. Cree un almacén antes de facturar productos.`,
    );
  }

  return warehouse.id;
}

/**
 * Deducción de inventario por venta — el equivalente contable del despacho.
 *
 * Por cada línea de la factura que referencie un producto físico con control de
 * existencias crea un movimiento inmutable `sale_out` desde el almacén de despacho,
 * con snapshot del costo promedio ponderado vigente. Recorre el mismo camino del
 * Kardex que la recepción de compras (`postPurchaseReceptionMovements`):
 *
 * - Lock de fila sobre la factura (`FOR UPDATE`) para serializar publicación concurrente.
 * - Idempotencia estructural: si ya existen movimientos `sale_out` de esta factura,
 *   no se repite nada (el Kardex inmutable ES el flag de `stockDeducted` de Cendaro).
 * - El hook `afterChangeStockMovement` recalcula el `currentStock` de cada producto
 *   dentro de la misma transacción (req propagado).
 * - El Kardex bloquea ventas sin stock suficiente (`getProductWarehouseStock` en su
 *   `beforeValidate`), por lo que facturar más de lo disponible revierte toda la
 *   operación atómicamente con un error claro.
 */
export async function applySaleStockDeduction(
  invoiceIdRaw: unknown,
  req: PayloadRequest,
): Promise<number> {
  const invoiceId = extractId(invoiceIdRaw);
  if (!invoiceId) return 0;

  const db = getActiveDb(req);

  // Lock de fila sobre la factura para serializar publicaciones concurrentes
  await db.execute(sql`SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE`);

  // Idempotencia: el Kardex inmutable actúa como flag de descarga
  const existingMovements = await db.execute(
    sql`SELECT id FROM stock_movements WHERE invoice_id = ${invoiceId} AND movement_type = 'sale_out' LIMIT 1`,
  );
  if (existingMovements.rows && existingMovements.rows.length > 0) {
    return 0; // Ya publicada
  }

  const invoice = (await req.payload.findByID({
    collection: 'invoices',
    id: invoiceId,
    depth: 0,
    req,
  })) as Invoice | undefined;

  if (!invoice) {
    throw new Error(`La factura ID ${invoiceId} no existe.`);
  }

  if (!(STOCK_COMMITTING_STATUSES as readonly string[]).includes(invoice.status)) {
    return 0; // Borradores y anuladas no descargan inventario
  }

  const tenantId = extractId(invoice.tenant);
  if (!tenantId) {
    throw new Error('La factura no tiene un inquilino válido.');
  }

  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const linesWithProduct: InvoiceLineWithProduct[] = items
    .map((item) => ({
      product: Number(extractId((item as { product?: unknown }).product)),
      quantity: Number(item.quantity) || 0,
    }))
    .filter((line) => line.product > 0 && line.quantity > 0)
    // Orden determinista por id de producto: el beforeValidate del Kardex toma
    // un advisory lock por (producto, almacén) — facturas concurrentes con las
    // mismas líneas en distinto orden podrían interbloquearse sin este orden.
    .sort((a, b) => a.product - b.product);

  if (linesWithProduct.length === 0) {
    return 0; // Factura de servicios o líneas de texto libre: sin efecto en el Kardex
  }

  const warehouseId = await resolveDispatchWarehouse(invoice, req);
  let movementsCreated = 0;

  // Orden global de locks: todos los advisory locks de saldo ANTES de cualquier
  // row lock de producto (recalculateProductTotalStock en el afterChange).
  await lockStockBalances(
    linesWithProduct.map((line) => ({ productId: line.product, warehouseId })),
    req,
  );

  for (const line of linesWithProduct) {
    const product = (await req.payload.findByID({
      collection: 'products',
      id: line.product,
      depth: 0,
      req,
      overrideAccess: true,
    })) as Product | undefined;

    if (!product) {
      throw new Error(`El producto ID ${line.product} de la factura no existe.`);
    }

    const productTenant = extractId(product.tenant);
    if (productTenant && String(productTenant) !== String(tenantId)) {
      throw new Error(
        `Violación de multi-inquilino: el producto "${product.name}" (SKU ${product.sku}) pertenece a otro inquilino.`,
      );
    }

    // Servicios y productos sin control de existencias no generan Kardex
    if (product.productType === 'service' || product.trackInventory === false) {
      continue;
    }

    const unitCost = Number(product.costUSD) || 0;

    await runIsolatedContext(req, () =>
    req.payload.create({
      collection: 'stock-movements',
      data: {
        reference: `VENTA-${invoice.invoiceNumber}`,
        movementType: 'sale_out',
        product: product.id,
        sourceWarehouse: warehouseId,
        quantity: line.quantity,
        unitCostUSD: unitCost,
        totalCostUSD: Number((line.quantity * unitCost).toFixed(2)),
        invoice: invoice.id,
        tenant: tenantId as number,
        reason: `Salida por venta según factura ${invoice.invoiceNumber}`,
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
  }

  return movementsCreated;
}

/**
 * Reversión de inventario por anulación total de la factura.
 *
 * Idempotencia POR SALDOS: para cada (producto, almacén) calcula
 * `vendido − devuelto` y solo reingresa el remanente. Así conviven las
 * devoluciones parciales (returnSaleLines) con la anulación total sin
 * duplicar jamás un reingreso.
 */
export async function revertSaleFromInventory(
  invoiceIdRaw: unknown,
  req: PayloadRequest,
): Promise<number> {
  const invoiceId = extractId(invoiceIdRaw);
  if (!invoiceId) return 0;

  const db = getActiveDb(req);

  await db.execute(sql`SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE`);

  // Vendido por (producto, almacén de salida)
  const soldRes = await db.execute(
    sql`SELECT product_id, source_warehouse_id, SUM(quantity) AS qty,
               SUM(quantity * unit_cost_u_s_d) AS cost
        FROM stock_movements
        WHERE invoice_id = ${invoiceId} AND movement_type = 'sale_out'
        GROUP BY product_id, source_warehouse_id`,
  );
  const soldGroups = soldRes.rows || [];
  if (soldGroups.length === 0) {
    return 0; // No hay descarga que revertir
  }

  // Devuelto hasta ahora por (producto, almacén de reingreso)
  const returnedRes = await db.execute(
    sql`SELECT product_id, target_warehouse_id, SUM(quantity) AS qty
        FROM stock_movements
        WHERE invoice_id = ${invoiceId} AND movement_type = 'sale_return'
        GROUP BY product_id, target_warehouse_id`,
  );
  const returnedByKey = new Map<string, number>();
  for (const row of returnedRes.rows || []) {
    returnedByKey.set(`${row.product_id}:${row.target_warehouse_id}`, Number(row.qty) || 0);
  }

  const invoice = (await req.payload.findByID({
    collection: 'invoices',
    id: invoiceId,
    depth: 0,
    req,
  })) as Invoice | undefined;

  if (!invoice) {
    throw new Error(`La factura ID ${invoiceId} no existe para revertir su inventario.`);
  }

  const tenantId = extractId(invoice.tenant);
  let reversalsCreated = 0;

  for (const row of soldGroups) {
    const productId = Number(row.product_id);
    const warehouseId = Number(row.source_warehouse_id);
    if (!productId || !warehouseId) {
      throw new Error(
        `El movimiento de venta de la factura ${invoice.invoiceNumber} no tiene producto o almacén de origen y no puede revertirse.`,
      );
    }

    const soldQty = Number(row.qty) || 0;
    const soldCost = Number(row.cost) || 0;
    const alreadyReturned = returnedByKey.get(`${productId}:${warehouseId}`) || 0;
    const remaining = Number((soldQty - alreadyReturned).toFixed(4));
    if (remaining <= 0.0001) {
      continue; // Ya devuelto completamente (devoluciones parciales previas)
    }

    // Preserva el costo de la venta: el reingreso se valúa al costo promedio
    // ponderado de los `sale_out` originales (antes iba en 0 y subvaluaba el
    // Kardex). Hallazgo S4-1.
    const unitReturnCostUSD = soldQty > 0 ? Number((soldCost / soldQty).toFixed(4)) : 0;

    await runIsolatedContext(req, () =>
    req.payload.create({
      collection: 'stock-movements',
      data: {
        reference: `DEVOL-${invoice.invoiceNumber}`,
        movementType: 'sale_return',
        product: productId,
        targetWarehouse: warehouseId,
        quantity: remaining,
        unitCostUSD: unitReturnCostUSD,
        totalCostUSD: Number((remaining * unitReturnCostUSD).toFixed(2)),
        invoice: invoice.id,
        tenant: tenantId as number,
        reason: `Reversión total por anulación de la factura ${invoice.invoiceNumber}`,
      },
      req,
      overrideAccess: true,
      context: {
        ...req.context,
        allowInternalStockUpdate: true,
      },
    }),
    );

    reversalsCreated++;
  }

  return reversalsCreated;
}

/**
 * Devolución PARCIAL de mercancía sobre una factura vigente.
 *
 * Valida por producto que `devuelto + solicitado ≤ vendido` (consultando el
 * Kardex inmutable) y reingresa las unidades al MISMO almacén de donde salieron,
 * asignando por orden de los movimientos `sale_out` (FIFO).
 */
export async function returnSaleLines({
  invoice,
  lines,
  reason,
  req,
}: {
  invoice: Invoice;
  lines: Array<{ productId: number; quantity: number }>;
  reason?: string;
  req: PayloadRequest;
}): Promise<{ movementsCreated: number; results: Array<{ productId: number; quantity: number; status: 'ok' | 'error'; message?: string }> }> {
  const invoiceId = extractId(invoice.id);
  if (!invoiceId) {
    throw new Error('Factura inválida para registrar la devolución.');
  }

  const db = getActiveDb(req);

  await db.execute(sql`SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE`);

  const invoiceStatus = invoice.status;
  if (invoiceStatus === 'voided' || invoiceStatus === 'draft') {
    throw new Error('No se pueden devolver mercancías de una factura anulada o en borrador.');
  }

  const tenantId = extractId(invoice.tenant);
  if (!tenantId) {
    throw new Error('La factura no tiene un inquilino válido.');
  }

  // Vendido y devuelto por (producto, almacén)
  const soldRes = await db.execute(
    sql`SELECT product_id, source_warehouse_id, SUM(quantity) AS qty,
               SUM(quantity * unit_cost_u_s_d) AS cost
        FROM stock_movements
        WHERE invoice_id = ${invoiceId} AND movement_type = 'sale_out'
        GROUP BY product_id, source_warehouse_id
        ORDER BY id ASC`,
  );
  const soldByKey = new Map<string, number>();
  const saleOrder: Array<{
    key: string;
    productId: number;
    warehouseId: number;
    unitCostUSD: number;
  }> = [];
  for (const row of soldRes.rows || []) {
    const key = `${row.product_id}:${row.source_warehouse_id}`;
    const qty = Number(row.qty) || 0;
    soldByKey.set(key, (soldByKey.get(key) || 0) + qty);
    saleOrder.push({
      key,
      productId: Number(row.product_id),
      warehouseId: Number(row.source_warehouse_id),
      // Costo promedio ponderado de la salida original: el reingreso lo preserva
      // (antes se reingresaba en 0 y subvaluaba el Kardex). Hallazgo S4-1.
      unitCostUSD: qty > 0 ? Number((Number(row.cost) || 0) / qty) : 0,
    });
  }

  const returnedRes = await db.execute(
    sql`SELECT product_id, target_warehouse_id, SUM(quantity) AS qty
        FROM stock_movements
        WHERE invoice_id = ${invoiceId} AND movement_type = 'sale_return'
        GROUP BY product_id, target_warehouse_id`,
  );
  const returnedByKey = new Map<string, number>();
  for (const row of returnedRes.rows || []) {
    returnedByKey.set(`${row.product_id}:${row.target_warehouse_id}`, Number(row.qty) || 0);
  }

  const results: Array<{ productId: number; quantity: number; status: 'ok' | 'error'; message?: string }> = [];
  const pendingByProduct = new Map<number, number>();

  for (const line of lines) {
    if (!line.productId || line.quantity <= 0) {
      results.push({ productId: line.productId, quantity: line.quantity, status: 'error', message: 'Línea inválida.' });
      continue;
    }
    pendingByProduct.set(line.productId, (pendingByProduct.get(line.productId) || 0) + line.quantity);
  }

  let movementsCreated = 0;

  // Asignación FIFO por producto a través de los almacenes de salida
  for (const [productId, requestedQty] of pendingByProduct.entries()) {
    let remainingRequest = requestedQty;
    const soldTotal = [...soldByKey.entries()]
      .filter(([key]) => key.startsWith(`${productId}:`))
      .reduce((acc, [, qty]) => acc + qty, 0);
    const returnedAtStart = [...returnedByKey.entries()]
      .filter(([key]) => key.startsWith(`${productId}:`))
      .reduce((acc, [, qty]) => acc + qty, 0);

    if (soldTotal <= 0) {
      results.push({ productId, quantity: requestedQty, status: 'error', message: 'El producto no fue vendido en esta factura (líneas sin catálogo no devuelven inventario).' });
      continue;
    }

    for (const sale of saleOrder) {
      if (sale.productId !== productId || remainingRequest <= 0.0001) continue;

      const sold = soldByKey.get(sale.key) || 0;
      const alreadyReturned = returnedByKey.get(sale.key) || 0;
      const available = Number((sold - alreadyReturned).toFixed(4));
      if (available <= 0.0001) continue;

      const toReturn = Math.min(remainingRequest, available);

      await runIsolatedContext(req, () =>
      req.payload.create({
        collection: 'stock-movements',
        data: {
          reference: `DEVOL-${invoice.invoiceNumber}`,
          movementType: 'sale_return',
          product: productId,
          targetWarehouse: sale.warehouseId,
          quantity: toReturn,
          unitCostUSD: Number(sale.unitCostUSD.toFixed(4)),
          totalCostUSD: Number((toReturn * sale.unitCostUSD).toFixed(2)),
          invoice: invoice.id,
          tenant: tenantId as number,
          reason:
            reason ||
            `Devolución parcial de mercancía de la factura ${invoice.invoiceNumber}`,
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
      remainingRequest = Number((remainingRequest - toReturn).toFixed(4));
      returnedByKey.set(sale.key, alreadyReturned + toReturn);
    }

    if (remainingRequest > 0.0001) {
      const availableTotal = Math.max(soldTotal - returnedAtStart, 0);
      results.push({
        productId,
        quantity: remainingRequest,
        status: 'error',
        message: `Cantidad a devolver excede lo disponible: vendido ${soldTotal}, ya devuelto ${returnedAtStart.toFixed(4)}, disponible ${availableTotal.toFixed(4)}.`,
      });
    } else {
      results.push({ productId, quantity: requestedQty, status: 'ok', message: 'Devolución registrada.' });
    }
  }

  return { movementsCreated, results };
}
