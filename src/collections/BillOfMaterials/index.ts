import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload';
import { extractId, getUserTenantIds, resolveTenantId } from '../../utilities/inventoryLedger';

const beforeValidateBOM: CollectionBeforeValidateHook = async ({ data, originalDoc, req }) => {
  if (!data) return data;

  const finishedProductId = extractId(data.product ?? originalDoc?.product);
  if (!finishedProductId) {
    throw new Error('Debe especificar un producto terminado válido para la receta (BOM).');
  }

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

  const productTenant = extractId(finishedProduct?.tenant);
  if (!productTenant) {
    throw new Error('El producto terminado asignado no tiene un inquilino válido.');
  }

  const specifiedTenant = resolveTenantId(data, originalDoc, req);
  if (specifiedTenant && String(specifiedTenant) !== String(productTenant)) {
    throw new Error('Violación de multi-inquilino: El producto terminado pertenece a otro inquilino.');
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

  const outputQty = Number(data.outputQuantity ?? originalDoc?.outputQuantity) || 1;
  if (outputQty <= 0) {
    throw new Error('El rendimiento estándar base (cantidad producida) debe ser mayor a cero.');
  }

  let totalMaterialsCostUSD = 0;

  // Merge items: if data.items was supplied, use it and recalculate snapshots; otherwise reuse originalDoc.items
  const itemsSupplied = Array.isArray(data.items);
  const itemsToProcess = itemsSupplied
    ? (data.items as Array<Record<string, unknown>>)
    : Array.isArray(originalDoc?.items)
      ? (originalDoc.items as Array<Record<string, unknown>>)
      : [];

  if (itemsToProcess.length > 0) {
    for (const item of itemsToProcess) {
      const rawId = extractId(item.rawMaterial);
      const qty = Number(item.quantity) || 0;
      const scrap = (Number(item.scrapFactorPercent) || 0) / 100;

      if (!rawId || qty <= 0) {
        throw new Error('Cada insumo de la receta requiere un producto válido y una cantidad mayor a cero.');
      }

      let costSnapshot = Number(item.unitCostSnapshotUSD) || 0;
      let subtotal = Number(item.subtotalCostUSD) || 0;

      // Recalculate snapshot if new items supplied, or if snapshot was not previously saved
      if (itemsSupplied || costSnapshot <= 0) {
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

        const rawTenant = extractId(rawDoc?.tenant);
        if (rawTenant && String(effectiveTenant) !== String(rawTenant)) {
          throw new Error(
            `Violación de multi-inquilino: La materia prima "${rawDoc?.name || rawId}" pertenece a otro inquilino.`,
          );
        }

        costSnapshot = Number(rawDoc?.costUSD) || 0;
        item.unitCostSnapshotUSD = costSnapshot;

        const effectiveQty = Number((qty * (1 + scrap)).toFixed(4));
        subtotal = Number((effectiveQty * costSnapshot).toFixed(2));
        item.subtotalCostUSD = subtotal;
      }

      totalMaterialsCostUSD += subtotal;
    }
  }

  const labor = Number(data.laborCostUSD ?? originalDoc?.laborCostUSD) || 0;
  const indirect = Number(data.indirectCostsUSD ?? originalDoc?.indirectCostsUSD) || 0;

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
