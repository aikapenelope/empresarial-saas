import type { CollectionConfig } from 'payload';

export const StockMovements: CollectionConfig = {
  slug: 'stock-movements',
  labels: {
    singular: 'Movimiento de Inventario',
    plural: 'Kardex de Inventario',
  },
  admin: {
    useAsTitle: 'reference',
    defaultColumns: ['reference', 'product', 'movementType', 'quantity', 'warehouse', 'movementDate'],
    group: 'Catálogo e Inventario',
  },
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) => Boolean(user),
    update: () => false, // Inmutable: no se deben modificar movimientos de Kardex históricos
    delete: ({ req: { user } }) => Boolean(user?.role === 'super-admin'),
  },
  hooks: {
    beforeChange: [
      async ({ data }) => {
        if (!data) return data;
        const qty = Number(data.quantity) || 0;
        const cost = Number(data.unitCostUSD) || 0;
        data.totalValueUSD = Math.round(Math.abs(qty * cost) * 100) / 100;
        data.movementDate = data.movementDate || new Date().toISOString();
        return data;
      },
    ],
    afterChange: [
      async ({ doc, req }) => {
        if (!doc || req.context?.skipStockRecalculation) return;

        const productId = typeof doc.product === 'object' && doc.product !== null
          ? doc.product.id
          : doc.product;

        if (!productId) return;

        try {
          const product = await req.payload.findByID({
            collection: 'products',
            id: String(productId),
            depth: 0,
            req,
          });

          if (product) {
            const currentStock = Number(product.inventory?.stockQuantity) || 0;
            const deltaQty = Number(doc.quantity) || 0;
            const newStock = Math.round((currentStock + deltaQty) * 1000) / 1000;

            await req.payload.update({
              collection: 'products',
              id: String(productId),
              data: {
                inventory: {
                  ...product.inventory,
                  stockQuantity: newStock,
                },
              },
              req,
              context: {
                ...req.context,
                skipStockRecalculation: true,
              },
              overrideAccess: true,
            });
          }
        } catch (err) {
          req.payload.logger.error({ err }, `Error updating product stock in movement ${doc.id}`);
        }
      },
    ],
  },
  fields: [
    {
      name: 'reference',
      label: 'Documento / Folio de Referencia',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'product',
      label: 'Producto / Ítem',
      type: 'relationship',
      relationTo: 'products',
      required: true,
      index: true,
    },
    {
      name: 'warehouse',
      label: 'Almacén / Depósito',
      type: 'relationship',
      relationTo: 'warehouses',
      required: true,
      index: true,
    },
    {
      name: 'movementType',
      label: 'Tipo de Movimiento',
      type: 'select',
      required: true,
      options: [
        { label: 'Entrada por Compra (Proveedor)', value: 'purchase' },
        { label: 'Salida por Venta / Facturación', value: 'sale' },
        { label: 'Transferencia entre Almacenes', value: 'transfer' },
        { label: 'Ajuste de Entrada (+)', value: 'adjustment_in' },
        { label: 'Ajuste de Salida (-)', value: 'adjustment_out' },
        { label: 'Consumo de Materia Prima (Producción)', value: 'raw_material_consumption' },
        { label: 'Entrada de Producto Terminado (Producción)', value: 'production_receipt' },
        { label: 'Carga Inicial de Stock', value: 'initial_stock' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'quantity',
      label: 'Cantidad (+ Entrada / - Salida)',
      type: 'number',
      required: true,
    },
    {
      name: 'unitCostUSD',
      label: 'Costo Unitario (USD)',
      type: 'number',
      required: true,
      defaultValue: 0,
    },
    {
      name: 'totalValueUSD',
      label: 'Valor Total del Movimiento (USD)',
      type: 'number',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'movementDate',
      label: 'Fecha del Movimiento',
      type: 'date',
      required: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'notes',
      label: 'Observaciones / Justificación',
      type: 'textarea',
    },
  ],
};
