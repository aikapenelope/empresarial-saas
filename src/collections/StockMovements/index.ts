import type {
  CollectionAfterChangeHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
} from 'payload';
import {
  extractId,
  getProductWarehouseStock,
  getUserTenantIds,
  lockStockBalance,
  recalculateProductTotalStock,
  resolveTenantId,
  updateProductWeightedCostOnPurchase,
} from '../../utilities/inventoryLedger';

const beforeValidateStockMovement: CollectionBeforeValidateHook = async ({
  data,
  operation,
  req,
}) => {
  if (!data) return data;

  const qty = Number(data.quantity) || 0;
  if (qty <= 0) {
    throw new Error('La cantidad de unidades en el movimiento debe ser mayor a cero.');
  }

  const unitCost = Number(data.unitCostUSD) || 0;
  data.totalCostUSD = Number((qty * unitCost).toFixed(2));

  const type = data.movementType as string;
  const sourceId = extractId(data.sourceWarehouse);
  const targetId = extractId(data.targetWarehouse);

  // Validate and enforce strict warehouse topology according to movement type
  if (type === 'transfer') {
    if (!sourceId || !targetId) {
      throw new Error('Una transferencia de inventario requiere tanto almacén origen como destino.');
    }
    if (String(sourceId) === String(targetId)) {
      throw new Error('El almacén origen y destino en una transferencia deben ser distintos.');
    }
  } else if (
    type === 'sale_out' ||
    type === 'production_consume' ||
    type === 'adjustment_negative' ||
    type === 'scrap'
  ) {
    if (!sourceId) {
      throw new Error(`El tipo de movimiento "${type}" requiere especificar un almacén de origen.`);
    }
    if (targetId) {
      throw new Error(
        `El tipo de movimiento "${type}" es una salida y no permite especificar un almacén de destino.`,
      );
    }
  } else if (
    type === 'purchase_in' ||
    type === 'production_output' ||
    type === 'adjustment_positive'
  ) {
    if (!targetId) {
      throw new Error(`El tipo de movimiento "${type}" requiere especificar un almacén de destino.`);
    }
    if (sourceId) {
      throw new Error(
        `El tipo de movimiento "${type}" es una entrada y no permite especificar un almacén de origen.`,
      );
    }
  }

  // Multi-tenant and stock availability validation on creation
  if (operation === 'create') {
    const productId = extractId(data.product);
    if (!productId) {
      throw new Error('Debe especificar un producto válido para registrar el movimiento.');
    }

    const product = await req.payload.findByID({
      collection: 'products',
      id: productId,
      depth: 0,
      req,
      context: {
        ...req.context,
        skipInventoryRecalculation: true,
      },
    });

    if (!product) {
      throw new Error(`El producto ID ${productId} no existe.`);
    }

    // Verify tenant match across product, warehouses, production order, and invoice
    const productTenant = extractId(product.tenant);
    if (!productTenant) {
      throw new Error('El producto asignado no tiene un inquilino válido.');
    }

    const specifiedTenant = resolveTenantId(data, undefined, req);
    if (specifiedTenant && String(specifiedTenant) !== String(productTenant)) {
      throw new Error(
        'Violación de multi-inquilino: El producto no pertenece al inquilino especificado.',
      );
    }

    const effectiveTenant = productTenant;
    if (!data.tenant) {
      data.tenant = productTenant as number;
    }

    // Enforce caller tenant access for non-super-admins
    if (req.user && req.user.role !== 'super-admin') {
      const userTenants = getUserTenantIds(req.user);
      if (!userTenants.map(String).includes(String(effectiveTenant))) {
        throw new Error('Prohibido: No tiene acceso a este inquilino.');
      }
    }

    if (sourceId) {
      const sourceWarehouse = await req.payload.findByID({
        collection: 'warehouses',
        id: sourceId,
        depth: 0,
        req,
        context: { ...req.context, skipInventoryRecalculation: true },
      });
      const swTenant = extractId(sourceWarehouse?.tenant);
      if (swTenant && String(effectiveTenant) !== String(swTenant)) {
        throw new Error('Violación de multi-inquilino: El almacén de origen pertenece a otro inquilino.');
      }
      // Invariante de almacén activo (misma que importStockToWarehouse): un
      // almacén deshabilitado no procesa movimientos — cubre transferencias,
      // ajustes, ventas y cualquier otro punto de entrada manual.
      if (sourceWarehouse && sourceWarehouse.isActive === false) {
        throw new Error('El almacén de origen está inactivo: no admite salidas de inventario.');
      }
    }

    if (targetId) {
      const targetWarehouse = await req.payload.findByID({
        collection: 'warehouses',
        id: targetId,
        depth: 0,
        req,
        context: { ...req.context, skipInventoryRecalculation: true },
      });
      const twTenant = extractId(targetWarehouse?.tenant);
      if (twTenant && String(effectiveTenant) !== String(twTenant)) {
        throw new Error('Violación de multi-inquilino: El almacén de destino pertenece a otro inquilino.');
      }
      if (targetWarehouse && targetWarehouse.isActive === false) {
        throw new Error('El almacén de destino está inactivo: no admite entradas de inventario.');
      }
    }

    const prodOrderId = extractId(data.productionOrder);
    if (prodOrderId) {
      if (type !== 'production_consume' && type !== 'production_output') {
        throw new Error(
          'El campo "productionOrder" solo puede asociarse a movimientos de tipo "production_consume" o "production_output".',
        );
      }

      const prodOrder = await req.payload.findByID({
        collection: 'production-orders',
        id: prodOrderId,
        depth: 0,
        req,
        context: { ...req.context, skipInventoryRecalculation: true },
      });
      if (!prodOrder) {
        throw new Error(`La orden de producción ID ${prodOrderId} no existe.`);
      }

      const poTenant = extractId(prodOrder?.tenant);
      if (poTenant && String(effectiveTenant) !== String(poTenant)) {
        throw new Error('Violación de multi-inquilino: La orden de producción pertenece a otro inquilino.');
      }

      if (type === 'production_output') {
        const orderProductId = extractId(prodOrder.product);
        if (orderProductId && String(orderProductId) !== String(productId)) {
          throw new Error(
            'Inconsistencia: El producto en la salida de producción no coincide con el producto terminado de la orden de producción.',
          );
        }
      }
    }

    const invoiceId = extractId(data.invoice);
    if (invoiceId) {
      const invoice = await req.payload.findByID({
        collection: 'invoices',
        id: invoiceId,
        depth: 0,
        req,
        context: { ...req.context, skipInventoryRecalculation: true },
      });
      const invTenant = extractId(invoice?.tenant);
      if (invTenant && String(effectiveTenant) !== String(invTenant)) {
        throw new Error('Violación de multi-inquilino: La factura asociada pertenece a otro inquilino.');
      }
    }

    const purchaseInvoiceId = extractId(data.purchaseInvoice);
    if (purchaseInvoiceId) {
      if (type !== 'purchase_in') {
        throw new Error(
          'El campo "purchaseInvoice" solo puede asociarse a movimientos de tipo "purchase_in".',
        );
      }
      const purchaseInvoice = await req.payload.findByID({
        collection: 'purchase-invoices',
        id: purchaseInvoiceId,
        depth: 0,
        req,
        context: {
          ...req.context,
          skipInventoryRecalculation: true,
          skipBalanceRecalculation: true,
        },
      });
      const piTenant = extractId(purchaseInvoice?.tenant);
      if (piTenant && String(effectiveTenant) !== String(piTenant)) {
        throw new Error(
          'Violación de multi-inquilino: La factura de compra asociada pertenece a otro inquilino.',
        );
      }
    }

    // Check source warehouse availability for every stock-decreasing movement
    if (
      sourceId &&
      (type === 'transfer' ||
        type === 'sale_out' ||
        type === 'production_consume' ||
        type === 'adjustment_negative' ||
        type === 'scrap')
    ) {
      // Servicios y productos sin control de existencias no generan kardex:
      // una salida crearía saldo ficticio para algo excluido del inventario.
      if (product.productType === 'service' || product.trackInventory === false) {
        throw new Error(
          `"${product.name}" no controla existencias (servicio o sin kardex): no admite salidas de inventario.`,
        );
      }

      // Serializa validación + escritura del saldo (par producto/almacén) para
      // que dos descargas concurrentes no lean el mismo disponible y negativicen
      // el inventario. El hook corre dentro de la transacción del llamador.
      await lockStockBalance(productId, sourceId, req);

      const availableStock = await getProductWarehouseStock(productId, sourceId, req);
      if (availableStock < qty - 0.0001) {
        throw new Error(
          `Stock insuficiente para el producto "${product.name}" en el almacén origen: Disponible ${availableStock}, requerido ${qty}.`,
        );
      }
    }
  }

  return data;
};

const afterChangeStockMovement: CollectionAfterChangeHook = async ({ doc, req }) => {
  if (req.context?.skipInventoryRecalculation) return doc;

  const productId = extractId(doc.product);
  if (productId) {
    // Recalculate total on-hand stock
    await recalculateProductTotalStock(productId, req);

    // If purchase entry, update weighted-average cost (CPP)
    if (doc.movementType === 'purchase_in' && Number(doc.unitCostUSD) > 0) {
      await updateProductWeightedCostOnPurchase(
        productId,
        Number(doc.quantity) || 0,
        Number(doc.unitCostUSD) || 0,
        req,
      );
    }
  }

  return doc;
};

export const StockMovements: CollectionConfig = {
  slug: 'stock-movements',
  labels: {
    singular: 'Movimiento de Inventario',
    plural: 'Movimientos de Inventario',
  },
  admin: {
    useAsTitle: 'reference',
    group: 'Inventario & Producción',
    defaultColumns: [
      'reference',
      'movementType',
      'product',
      'sourceWarehouse',
      'targetWarehouse',
      'quantity',
      'totalCostUSD',
      'createdAt',
    ],
  },
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) =>
      Boolean(
        user?.role === 'super-admin' ||
          user?.role === 'tenant-admin' ||
          user?.role === 'supervisor',
      ),
    // Immutable ledger: movements cannot be modified or deleted once recorded
    update: () => false,
    delete: () => false,
  },
  hooks: {
    beforeValidate: [beforeValidateStockMovement],
    afterChange: [afterChangeStockMovement],
  },
  fields: [
    {
      name: 'reference',
      label: 'Referencia / Folio',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'movementType',
      label: 'Tipo de Movimiento',
      type: 'select',
      required: true,
      options: [
        { label: 'Entrada por Compra', value: 'purchase_in' },
        { label: 'Salida por Venta / Despacho', value: 'sale_out' },
        { label: 'Consumo de Insumos (Producción)', value: 'production_consume' },
        { label: 'Salida de Producto Fabricado (Producción)', value: 'production_output' },
        { label: 'Transferencia entre Almacenes', value: 'transfer' },
        { label: 'Ajuste Positivo (+)', value: 'adjustment_positive' },
        { label: 'Ajuste Negativo (-)', value: 'adjustment_negative' },
        { label: 'Merma / Avería / Desecho', value: 'scrap' },
      ],
    },
    {
      name: 'product',
      label: 'Producto / Insumo',
      type: 'relationship',
      relationTo: 'products',
      required: true,
      index: true,
    },
    {
      name: 'sourceWarehouse',
      label: 'Almacén Origen (Salida)',
      type: 'relationship',
      relationTo: 'warehouses',
      index: true,
    },
    {
      name: 'targetWarehouse',
      label: 'Almacén Destino (Entrada)',
      type: 'relationship',
      relationTo: 'warehouses',
      index: true,
    },
    {
      name: 'quantity',
      label: 'Cantidad de Unidades',
      type: 'number',
      required: true,
      min: 0.0001,
    },
    {
      name: 'unitCostUSD',
      label: 'Costo Unitario (USD)',
      type: 'number',
      required: true,
      defaultValue: 0,
      min: 0,
    },
    {
      name: 'totalCostUSD',
      label: 'Costo Total Movimiento (USD)',
      type: 'number',
      required: true,
      defaultValue: 0,
      min: 0,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'reason',
      label: 'Motivo / Justificación',
      type: 'text',
    },
    {
      name: 'productionOrder',
      label: 'Orden de Producción Asociada',
      type: 'relationship',
      relationTo: 'production-orders',
      index: true,
    },
    {
      name: 'invoice',
      label: 'Factura / CxC Asociada',
      type: 'relationship',
      relationTo: 'invoices',
      index: true,
    },
    {
      name: 'purchaseInvoice',
      label: 'Factura de Compra / CxP Asociada',
      type: 'relationship',
      relationTo: 'purchase-invoices',
      index: true,
    },
  ],
  timestamps: true,
};
