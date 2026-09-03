import type { CollectionConfig } from 'payload';

export const BillOfMaterials: CollectionConfig = {
  slug: 'bill-of-materials',
  labels: {
    singular: 'Fórmula BOM',
    plural: 'Fórmulas y Recetas (BOM)',
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'code', 'finishedProduct', 'yieldQuantity', 'unitProductionCostUSD', 'status'],
    group: 'Producción & Fabricación',
  },
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => Boolean(user),
  },
  hooks: {
    beforeChange: [
      async ({ data, req }) => {
        if (!data) return data;

        let totalRawMaterialCost = 0;

        if (Array.isArray(data.components) && data.components.length > 0) {
          const updatedComponents = [];

          for (const comp of data.components) {
            const rawId = typeof comp.rawMaterial === 'object' && comp.rawMaterial !== null
              ? comp.rawMaterial.id
              : comp.rawMaterial;

            let unitCost = Number(comp.unitCostSnapshot) || 0;

            // Si el costo no está fijado, consultar el costo del insumo
            if (unitCost === 0 && rawId) {
              try {
                const rawProduct = await req.payload.findByID({
                  collection: 'products',
                  id: String(rawId),
                  depth: 0,
                  req,
                });
                if (rawProduct) {
                  unitCost = Number(rawProduct.pricing?.averageCostUSD || rawProduct.pricing?.costPriceUSD) || 0;
                }
              } catch {
                unitCost = 0;
              }
            }

            const qty = Number(comp.quantity) || 0;
            const scrap = Number(comp.scrapPercentage) || 0;
            const effectiveQty = qty * (1 + scrap / 100);
            const subtotal = Math.round(effectiveQty * unitCost * 1000) / 1000;

            totalRawMaterialCost += subtotal;

            updatedComponents.push({
              ...comp,
              unitCostSnapshot: unitCost,
              subtotalCostUSD: subtotal,
            });
          }

          data.components = updatedComponents;
        }

        const labor = Number(data.laborCostUSD) || 0;
        const overhead = Number(data.overheadCostUSD) || 0;
        const totalBatch = Math.round((totalRawMaterialCost + labor + overhead) * 100) / 100;
        const yieldQty = Math.max(1, Number(data.yieldQuantity) || 1);

        data.totalRawMaterialCostUSD = Math.round(totalRawMaterialCost * 100) / 100;
        data.totalBatchCostUSD = totalBatch;
        data.unitProductionCostUSD = Math.round((totalBatch / yieldQty) * 1000) / 1000;

        return data;
      },
    ],
  },
  fields: [
    {
      name: 'name',
      label: 'Nombre de la Fórmula / Receta',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'code',
      label: 'Código BOM',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'finishedProduct',
      label: 'Producto Terminado Resultante',
      type: 'relationship',
      relationTo: 'products',
      required: true,
      index: true,
      filterOptions: {
        productType: { equals: 'manufactured' },
      },
    },
    {
      name: 'yieldQuantity',
      label: 'Rendimiento Base por Lote',
      type: 'number',
      required: true,
      defaultValue: 1,
      min: 1,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'yieldUnit',
      label: 'Unidad de Rendimiento',
      type: 'select',
      required: true,
      defaultValue: 'unit',
      options: [
        { label: 'Unidad (pza / un)', value: 'unit' },
        { label: 'Kilogramo (kg)', value: 'kg' },
        { label: 'Gramo (g)', value: 'g' },
        { label: 'Litro (L)', value: 'l' },
        { label: 'Caja (caja)', value: 'box' },
        { label: 'Paquete (pack)', value: 'pack' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'version',
      label: 'Versión',
      type: 'text',
      defaultValue: 'v1.0',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'status',
      label: 'Estado de la Fórmula',
      type: 'select',
      defaultValue: 'active',
      options: [
        { label: 'Activa / En Producción', value: 'active' },
        { label: 'Borrador / Experimental', value: 'draft' },
        { label: 'Obsoleta / Archivada', value: 'archived' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    // --- Lista de Materiales e Insumos ---
    {
      name: 'components',
      label: 'Lista de Componentes e Insumos Requeridos',
      type: 'array',
      required: true,
      fields: [
        {
          name: 'rawMaterial',
          label: 'Materia Prima / Insumo',
          type: 'relationship',
          relationTo: 'products',
          required: true,
        },
        {
          name: 'quantity',
          label: 'Cantidad Requerida por Lote Base',
          type: 'number',
          required: true,
          defaultValue: 1,
        },
        {
          name: 'unit',
          label: 'Unidad',
          type: 'text',
          required: true,
        },
        {
          name: 'scrapPercentage',
          label: '% Merma Estimada',
          type: 'number',
          defaultValue: 0,
        },
        {
          name: 'unitCostSnapshot',
          label: 'Costo Unitario Insumo (USD)',
          type: 'number',
          defaultValue: 0,
        },
        {
          name: 'subtotalCostUSD',
          label: 'Subtotal Insumo (USD)',
          type: 'number',
          admin: {
            readOnly: true,
          },
        },
      ],
    },
    // --- Costos de Conversión y Totales ---
    {
      name: 'costs',
      label: 'Estructura de Costeo de Producción',
      type: 'group',
      fields: [
        {
          name: 'laborCostUSD',
          label: 'Mano de Obra Directa por Lote (USD)',
          type: 'number',
          defaultValue: 0,
        },
        {
          name: 'overheadCostUSD',
          label: 'Costos Indirectos de Fabricación - CIF por Lote (USD)',
          type: 'number',
          defaultValue: 0,
        },
        {
          name: 'totalRawMaterialCostUSD',
          label: 'Costo Total Materias Primas (USD)',
          type: 'number',
          admin: {
            readOnly: true,
          },
        },
        {
          name: 'totalBatchCostUSD',
          label: 'Costo Total por Lote (USD)',
          type: 'number',
          admin: {
            readOnly: true,
          },
        },
        {
          name: 'unitProductionCostUSD',
          label: 'Costo Unitario Teórico Resultante (USD)',
          type: 'number',
          admin: {
            readOnly: true,
            description: 'Costo unitario teórico (Costo Lote / Rendimiento Base).',
          },
        },
      ],
    },
    {
      name: 'instructions',
      label: 'Instrucciones del Proceso de Fabricación',
      type: 'textarea',
    },
  ],
};
