import type { PayloadRequest } from 'payload';
import { sql } from '@payloadcms/db-postgres';
import { extractId, getActiveDb } from './inventoryLedger';
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
    context: {
      ...req.context,
      skipBalanceRecalculation: true,
    },
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
    .filter((line) => line.product > 0 && line.quantity > 0);

  if (linesWithProduct.length === 0) {
    return 0; // Factura de servicios o líneas de texto libre: sin efecto en el Kardex
  }

  const warehouseId = await resolveDispatchWarehouse(invoice, req);
  let movementsCreated = 0;

  for (const line of linesWithProduct) {
    const product = (await req.payload.findByID({
      collection: 'products',
      id: line.product,
      depth: 0,
      req,
      overrideAccess: true,
      context: {
        ...req.context,
        skipInventoryRecalculation: true,
      },
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

    await req.payload.create({
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
    });

    movementsCreated++;
  }

  return movementsCreated;
}

/**
 * Reversión de inventario por anulación de factura o devolución de mercancía.
 *
 * Relee los movimientos `sale_out` inmutables de la factura y crea por cada uno un
 * movimiento `sale_return` que reingresa la misma cantidad, al mismo almacén y con
 * el mismo costo snapshot. Idempotente con la misma disciplina de lock + consulta.
 */
export async function revertSaleFromInventory(
  invoiceIdRaw: unknown,
  req: PayloadRequest,
): Promise<number> {
  const invoiceId = extractId(invoiceIdRaw);
  if (!invoiceId) return 0;

  const db = getActiveDb(req);

  await db.execute(sql`SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE`);

  // Idempotencia: no duplicar reversiones
  const existingReversals = await db.execute(
    sql`SELECT id FROM stock_movements WHERE invoice_id = ${invoiceId} AND movement_type = 'sale_return' LIMIT 1`,
  );
  if (existingReversals.rows && existingReversals.rows.length > 0) {
    return 0; // Ya revertida
  }

  const saleMovementsRes = await db.execute(
    sql`SELECT id, product_id, source_warehouse_id, quantity, unit_cost_u_s_d, reference FROM stock_movements WHERE invoice_id = ${invoiceId} AND movement_type = 'sale_out'`,
  );
  const saleMovements = saleMovementsRes.rows || [];
  if (saleMovements.length === 0) {
    return 0; // No hay descarga que revertir
  }

  const invoice = (await req.payload.findByID({
    collection: 'invoices',
    id: invoiceId,
    depth: 0,
    req,
    context: {
      ...req.context,
      skipBalanceRecalculation: true,
    },
  })) as Invoice | undefined;

  if (!invoice) {
    throw new Error(`La factura ID ${invoiceId} no existe para revertir su inventario.`);
  }

  const tenantId = extractId(invoice.tenant);
  let reversalsCreated = 0;

  for (const row of saleMovements) {
    const sourceWarehouseId = Number(row.source_warehouse_id);
    if (!sourceWarehouseId) {
      throw new Error(
        `El movimiento de venta ${row.reference} no tiene almacén de origen y no puede revertirse.`,
      );
    }

    await req.payload.create({
      collection: 'stock-movements',
      data: {
        reference: `DEVOL-${invoice.invoiceNumber}`,
        movementType: 'sale_return',
        product: Number(row.product_id),
        targetWarehouse: sourceWarehouseId,
        quantity: Number(row.quantity),
        unitCostUSD: Number(row.unit_cost_u_s_d) || 0,
        totalCostUSD: Number(
          ((Number(row.quantity) || 0) * (Number(row.unit_cost_u_s_d) || 0)).toFixed(2),
        ),
        invoice: invoice.id,
        tenant: tenantId as number,
        reason: `Devolución de mercancía de la factura ${invoice.invoiceNumber}`,
      },
      req,
      overrideAccess: true,
      context: {
        ...req.context,
        allowInternalStockUpdate: true,
      },
    });

    reversalsCreated++;
  }

  return reversalsCreated;
}
