import type { CollectionConfig } from 'payload';

export const Products: CollectionConfig = {
  slug: 'products',
  labels: {
    singular: 'Producto / Insumo',
    plural: 'Productos & Catálogo',
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'sku', 'productType', 'salePriceUSD', 'averageCostUSD', 'stockQuantity'],
    group: 'Catálogo e Inventario',
  },
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => Boolean(user),
  },
  hooks: {
    beforeChange: [
      async ({ data, operation }) => {
        if (!data) return data;
        if (operation === 'create') {
          if (data.costPriceUSD && !data.averageCostUSD) {
            data.averageCostUSD = data.costPriceUSD;
          }
          if (data.stockQuantity === undefined) {
            data.stockQuantity = 0;
          }
        }
        return data;
      },
    ],
  },
  fields: [
    {
      name: 'name',
      label: 'Nombre del Producto o Insumo',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'sku',
      label: 'Código SKU / Identificador Interno',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'barcode',
      label: 'Código de Barras (EAN / UPC)',
      type: 'text',
      index: true,
    },
    {
      name: 'productType',
      label: 'Tipo de Ítem',
      type: 'select',
      required: true,
      defaultValue: 'standard',
      options: [
        { label: 'Producto Comercial Estándar (Reventa)', value: 'standard' },
        { label: 'Materia Prima / Insumo de Producción', value: 'raw_material' },
        { label: 'Producto Fabricado / Terminado (BOM)', value: 'manufactured' },
        { label: 'Kit / Combo Ensamblado', value: 'combo' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'category',
      label: 'Categoría',
      type: 'relationship',
      relationTo: 'categories',
      index: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'unitOfMeasure',
      label: 'Unidad de Medida',
      type: 'select',
      required: true,
      defaultValue: 'unit',
      options: [
        { label: 'Unidad (pza / un)', value: 'unit' },
        { label: 'Kilogramo (kg)', value: 'kg' },
        { label: 'Gramo (g)', value: 'g' },
        { label: 'Litro (L)', value: 'l' },
        { label: 'Mililitro (ml)', value: 'ml' },
        { label: 'Metro (m)', value: 'm' },
        { label: 'Caja (caja)', value: 'box' },
        { label: 'Paquete (pack)', value: 'pack' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    // --- Precios y Costeo ---
    {
      name: 'pricing',
      label: 'Precios y Costos',
      type: 'group',
      fields: [
        {
          name: 'salePriceUSD',
          label: 'Precio de Venta Base (USD)',
          type: 'number',
          required: true,
          defaultValue: 0,
        },
        {
          name: 'wholesalePriceUSD',
          label: 'Precio Mayorista (USD)',
          type: 'number',
          defaultValue: 0,
        },
        {
          name: 'costPriceUSD',
          label: 'Costo de Reposición / Compra (USD)',
          type: 'number',
          defaultValue: 0,
        },
        {
          name: 'averageCostUSD',
          label: 'Costo Promedio Ponderado Real (USD)',
          type: 'number',
          defaultValue: 0,
          admin: {
            readOnly: true,
            description: 'Recalculado automáticamente por compras y órdenes de fabricación.',
          },
        },
      ],
    },
    // --- Existencias y Parámetros de Inventario ---
    {
      name: 'inventory',
      label: 'Control de Stock',
      type: 'group',
      fields: [
        {
          name: 'stockQuantity',
          label: 'Existencia Total Consolidada',
          type: 'number',
          defaultValue: 0,
          admin: {
            readOnly: true,
            description: 'Gobernado por los movimientos inmutables de Kardex.',
          },
        },
        {
          name: 'minStock',
          label: 'Stock Mínimo de Seguridad',
          type: 'number',
          defaultValue: 0,
        },
        {
          name: 'reorderPoint',
          label: 'Punto de Reorden (Alerta de Compra)',
          type: 'number',
          defaultValue: 0,
        },
      ],
    },
    {
      name: 'active',
      label: 'Disponible para Venta / Operación',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'images',
      label: 'Imágenes del Producto',
      type: 'relationship',
      relationTo: 'media',
      hasMany: true,
    },
    {
      name: 'description',
      label: 'Descripción Técnica / Detalles',
      type: 'textarea',
    },
  ],
};
