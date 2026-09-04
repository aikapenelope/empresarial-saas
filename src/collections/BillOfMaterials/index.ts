import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload';
import { extractId, resolveTenantId } from '../../utilities/inventoryLedger';

const beforeValidateBOM: CollectionBeforeValidateHook = async ({ data, originalDoc, req }) => {
  if (!data) return data;

  const currentTenant = resolveTenantId(data, originalDoc, req);

  // Validate finished product belongs to same tenant
  const finishedProductId = extractId(data.product ?? originalDoc?.product);
  if (currentTenant && finishedProductId) {
    const finishedProduct = await req.payload.findByID({
      collection: 'products',
      id: finishedProductId,
      depth: 0,
      req,
      context: {
        ...req.context,
        skipInventoryRecalculation: true,
      },
    });
    const prodTenant = extractId(finishedProduct?.tenant);
    if (prodTenant && String(currentTenant) !== String(prodTenant)) {
      throw new Error(
        'Violación de multi-inquilino: El producto terminado resultante pertenece a otro inquilino.',
      );
    }
  }

  const outputQty = Number(data.outputQuantity) || 1;
  if (outputQty <= 0) {
    throw new Error('El rendimiento estándar base (cantidad producida) debe ser mayor a cero.');
  }

  let totalMaterialsCostUSD = 0;

  if (Array.isArray(data.items)) {
    for (const item of data.items) {
      const rawId = extractId(item.rawMaterial);
      const qty = Number(item.quantity) || 0;
      const scrap = (Number(item.scrapFactorPercent) || 0) / 100;

      if (!rawId || qty <= 0) {
        throw new Error('Cada insumo de la receta requiere un producto válido y una cantidad mayor a cero.');
      }

      const rawDoc = await req.payload.findByID({
        collection: 'products',
        id: rawId,
        depth: 0,
        req,
        context: {
          ...req.context,
          skipInventoryRecalculation: true,
        },
      });

      if (currentTenant) {
        const rawTenant = extractId(rawDoc?.tenant);
        if (rawTenant && String(currentTenant) !== String(rawTenant)) {
          throw new Error(
            `Violación de multi-inquilino: La materia prima "${rawDoc?.name || rawId}" pertenece a otro inquilino.`,
          );
        }
      }

      const costSnapshot = Number(rawDoc?.costUSD) || 0;
      item.unitCostSnapshotUSD = costSnapshot;

      const effectiveQty = Number((qty * (1 + scrap)).toFixed(4));
      const subtotal = Number((effectiveQty * costSnapshot).toFixed(2));
      item.subtotalCostUSD = subtotal;

      totalMaterialsCostUSD += subtotal;
    }
  }

  const labor = Number(data.laborCostUSD) || 0;
  const indirect = Number(data.indirectCostsUSD) || 0;

  data.totalBatchCostUSD = Number((totalMaterialsCostUSD + labor + indirect).toFixed(2));
  data.totalUnitCostUSD = Number((data.totalBatchCostUSD / outputQty).toFixed(4));

  return data;
};

export const BillOfMaterials: CollectionConfig = {
  slug: 'bill-of-materials',
  labels: {
    singular: 'Fórmula / Receta (BOM)',
    plural: 'Fórmulas / Recetas (BOM)',
  },
  admin: {
    useAsTitle: 'name',
    group: 'Inventario & Producción',
    defaultColumns: ['name', 'product', 'outputQuantity', 'totalUnitCostUSD', 'isActive'],
  },
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) =>
      Boolean(
        user?.role === 'super-admin' ||
          user?.role === 'tenant-admin' ||
          user?.role === 'supervisor',
      ),
    update: ({ req: { user } }) =>
      Boolean(
        user?.role === 'super-admin' ||
          user?.role === 'tenant-admin' ||
          user?.role === 'supervisor',
      ),
    delete: ({ req: { user } }) =>
      Boolean(user?.role === 'super-admin' || user?.role === 'tenant-admin'),
  },
  hooks: {
    beforeValidate: [beforeValidateBOM],
  },
  fields: [
    {
      name: 'name',
      label: 'Nombre de la Fórmula o Receta',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'product',
      label: 'Producto Terminado Resultante',
      type: 'relationship',
      relationTo: 'products',
      required: true,
      index: true,
    },
    {
      name: 'outputQuantity',
      label: 'Rendimiento Estándar Base (Unidades)',
      type: 'number',
      required: true,
      defaultValue: 1,
      min: 0.0001,
    },
    {
      name: 'items',
      label: 'Estructura de Insumos / Materias Primas',
      type: 'array',
      required: true,
      minRows: 1,
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
          min: 0.0001,
        },
        {
          name: 'scrapFactorPercent',
          label: 'Factor de Merma Estimado (%)',
          type: 'number',
          defaultValue: 0,
          min: 0,
          max: 100,
        },
        {
          name: 'unitCostSnapshotUSD',
          label: 'Costo Unitario al Configurar (USD)',
          type: 'number',
          admin: {
            readOnly: true,
          },
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
    {
      name: 'laborCostUSD',
      label: 'Costo de Mano de Obra Directa (USD)',
      type: 'number',
      defaultValue: 0,
      min: 0,
    },
    {
      name: 'indirectCostsUSD',
      label: 'Costos Indirectos de Fabricación / CIF (USD)',
      type: 'number',
      defaultValue: 0,
      min: 0,
    },
    {
      name: 'totalBatchCostUSD',
      label: 'Costo Total del Lote Base (USD)',
      type: 'number',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'totalUnitCostUSD',
      label: 'Costo Unitario Resultante (USD)',
      type: 'number',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'instructions',
      label: 'Instrucciones / Procedimiento de Preparación',
      type: 'textarea',
    },
    {
      name: 'isActive',
      label: 'Receta Activa para Producción',
      type: 'checkbox',
      defaultValue: true,
    },
  ],
  timestamps: true,
};
