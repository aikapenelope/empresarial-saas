import type {
  CollectionAfterChangeHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
} from 'payload';
import {
  extractId,
  getProductWarehouseStock,
  recalculateProductTotalStock,
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

  // Validate warehouse topology according to movement type
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
  } else if (
    type === 'purchase_in' ||
    type === 'production_output' ||
    type === 'adjustment_positive'
  ) {
    if (!targetId) {
      throw new Error(`El tipo de movimiento "${type}" requiere especificar un almacén de destino.`);
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

    // Verify tenant match
    const movementTenant = extractId(data.tenant);
    const productTenant = extractId(product.tenant);
    if (movementTenant && productTenant && String(movementTenant) !== String(productTenant)) {
      throw new Error(
        'Violación de multi-inquilino: El producto no pertenece al mismo inquilino del movimiento.',
      );
    }

    // For outbound movements (except internal adjustments), check source warehouse availability
    if (sourceId && (type === 'transfer' || type === 'sale_out' || type === 'scrap')) {
      const availableStock = await getProductWarehouseStock(productId, sourceId, req);
      if (availableStock < qty - 0.0001) {
        throw new Error(
          `Stock insuficiente para el producto "${product.name}": Disponible ${availableStock}, requerido ${qty}.`,
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
    await recalculateProductTotalStock(productId, req);
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
    create: ({ req: { user } }) => Boolean(user),
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
  ],
  timestamps: true,
};
