import type {
  CollectionAfterChangeHook,
  CollectionBeforeDeleteHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
} from 'payload';
import {
  executeProductionOrder,
  extractId,
  getActiveDb,
  getUserTenantIds,
  resolveTenantId,
} from '../../utilities/inventoryLedger';
import { sql } from '@payloadcms/db-postgres';

const beforeValidateProductionOrder: CollectionBeforeValidateHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (!data) return data;

  if (operation === 'create') {
    if (!data.orderNumber) {
      data.orderNumber = `OP-${Date.now().toString().slice(-6)}`;
    }
    if (!data.quantityProduced && data.quantityPlanned) {
      data.quantityProduced = data.quantityPlanned;
    }
  }

  // Prevent modifying an already completed production order
  if (originalDoc?.status === 'completed' && operation === 'update') {
    const requestedStatus = data.status || originalDoc.status;
    if (requestedStatus !== 'completed') {
      throw new Error(
        'Una orden de producción completada no puede cambiar de estado porque sus movimientos de inventario ya fueron asentados en el Kardex.',
      );
    }

    // Allow internal completion hook to write computed batch costs
    const isInternalCostUpdate = Boolean(req.context?.allowInternalCostUpdate);

    const immutableFields = [
      'product',
      'bom',
      'quantityPlanned',
      'quantityProduced',
      'sourceWarehouse',
      'targetWarehouse',
      'completionDate',
      ...(isInternalCostUpdate ? [] : (['totalCostUSD', 'unitCostUSD'] as const)),
    ] as const;

    for (const field of immutableFields) {
      if (data[field] !== undefined) {
        const origVal = extractId(originalDoc[field]) ?? originalDoc[field];
        const newVal = extractId(data[field]) ?? data[field];
        if (String(origVal) !== String(newVal)) {
          throw new Error(
            `El campo "${field}" no puede modificarse en una orden de producción completada.`,
          );
        }
      }
    }
  }

  const planned = Number(data.quantityPlanned) || Number(originalDoc?.quantityPlanned) || 0;
  if (planned <= 0) {
    throw new Error('La cantidad planificada a fabricar debe ser mayor a cero.');
  }

  // Cross-tenant boundary verification anchored on the finished product
  const targetProductId = extractId(data.product ?? originalDoc?.product);
  const targetBomId = extractId(data.bom ?? originalDoc?.bom);
  const sourceWhId = extractId(data.sourceWarehouse ?? originalDoc?.sourceWarehouse);
  const targetWhId = extractId(data.targetWarehouse ?? originalDoc?.targetWarehouse);

  let activeTenantId = resolveTenantId(data, originalDoc, req);

  if (targetProductId) {
    const prodDoc = await req.payload.findByID({
      collection: 'products',
      id: targetProductId,
      depth: 0,
      req,
      context: { ...req.context, skipInventoryRecalculation: true },
    });
    const pTenant = extractId(prodDoc?.tenant);
    if (!pTenant) {
      throw new Error('El producto a fabricar no tiene un inquilino asignado.');
    }

    if (activeTenantId && String(activeTenantId) !== String(pTenant)) {
      throw new Error('Violación de multi-inquilino: El producto a fabricar pertenece a otro inquilino.');
    }

    activeTenantId = pTenant;
    if (!data.tenant) {
      data.tenant = pTenant as number;
    }
  }

  // Enforce caller tenant access for non-super-admins
  if (activeTenantId && req.user && req.user.role !== 'super-admin') {
    const userTenants = getUserTenantIds(req.user);
    if (!userTenants.map(String).includes(String(activeTenantId))) {
      throw new Error('Prohibido: No tiene acceso a este inquilino.');
    }
  }

  if (activeTenantId) {
    if (targetBomId) {
      const bomDoc = await req.payload.findByID({
        collection: 'bill-of-materials',
        id: targetBomId,
        depth: 0,
        req,
        context: { ...req.context, skipInventoryRecalculation: true },
      });
      const bTenant = extractId(bomDoc?.tenant);
      if (bTenant && String(activeTenantId) !== String(bTenant)) {
        throw new Error('Violación de multi-inquilino: La fórmula / receta (BOM) pertenece a otro inquilino.');
      }
    }

    if (sourceWhId) {
      const sWhDoc = await req.payload.findByID({
        collection: 'warehouses',
        id: sourceWhId,
        depth: 0,
        req,
        context: { ...req.context, skipInventoryRecalculation: true },
      });
      const sTenant = extractId(sWhDoc?.tenant);
      if (sTenant && String(activeTenantId) !== String(sTenant)) {
        throw new Error('Violación de multi-inquilino: El almacén de insumos origen pertenece a otro inquilino.');
      }
    }

    if (targetWhId) {
      const tWhDoc = await req.payload.findByID({
        collection: 'warehouses',
        id: targetWhId,
        depth: 0,
        req,
        context: { ...req.context, skipInventoryRecalculation: true },
      });
      const tTenant = extractId(tWhDoc?.tenant);
      if (tTenant && String(activeTenantId) !== String(tTenant)) {
        throw new Error('Violación de multi-inquilino: El almacén de producto terminado destino pertenece a otro inquilino.');
      }
    }
  }

  // Validate that the assigned BOM produces the ordered finished product
  if (targetProductId && targetBomId) {
    const bomDoc = await req.payload.findByID({
      collection: 'bill-of-materials',
      id: targetBomId,
      depth: 0,
      req,
      context: {
        ...req.context,
        skipInventoryRecalculation: true,
      },
    });
    if (bomDoc && String(extractId(bomDoc.product)) !== String(targetProductId)) {
      throw new Error('La fórmula / receta (BOM) seleccionada no corresponde al producto a fabricar.');
    }
  }

  // If transitioning to completed, validate and retain actual quantity produced
  if (data.status === 'completed') {
    const produced = Number(data.quantityProduced ?? originalDoc?.quantityProduced ?? planned);
    if (produced <= 0) {
      throw new Error('La cantidad efectivamente producida debe ser mayor a cero para completar la orden.');
    }
    data.quantityProduced = produced;
    if (!data.completionDate) {
      data.completionDate = (originalDoc?.completionDate as string) || new Date().toISOString();
    }
  }

  return data;
};

const afterChangeProductionOrder: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
}) => {
  if (req.context?.skipInventoryRecalculation) return doc;

  const previousStatus = previousDoc?.status as string | undefined;
  const currentStatus = doc.status as string;

  // Detect transition to completed: execute atomic inventory consumption and output
  if (previousStatus !== 'completed' && currentStatus === 'completed') {
    const producedQty = Number(doc.quantityProduced) || Number(doc.quantityPlanned) || 1;

    const result = await executeProductionOrder(
      {
        orderId: doc.id,
        quantityProduced: producedQty,
      },
      req,
    );

    // Save final costs on the production order doc with allowInternalCostUpdate
    await req.payload.update({
      collection: 'production-orders',
      id: doc.id,
      data: {
        totalCostUSD: result.totalBatchCostUSD,
        unitCostUSD: result.unitCostUSD,
      },
      req,
      context: {
        ...req.context,
        skipInventoryRecalculation: true,
        allowInternalCostUpdate: true,
      },
    });
  }

  return doc;
};

const beforeDeleteProductionOrder: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const order = await req.payload.findByID({
    collection: 'production-orders',
    id,
    depth: 0,
    req,
  });

  if (!order) return;

  if (order.status === 'completed') {
    throw new Error(
      `No se puede eliminar la orden de producción "${order.orderNumber || id}" porque está completada y sus movimientos de inventario ya están asentados en el Kardex.`,
    );
  }

  const db = getActiveDb(req);
  const existingMovements = await db.execute(
    sql`SELECT id FROM stock_movements WHERE production_order_id = ${id} LIMIT 1`,
  );

  if (existingMovements.rows && existingMovements.rows.length > 0) {
    throw new Error(
      `No se puede eliminar la orden de producción "${order.orderNumber || id}" porque tiene movimientos de inventario vinculados en el Kardex.`,
    );
  }
};

export const ProductionOrders: CollectionConfig = {
  slug: 'production-orders',
  labels: {
    singular: 'Orden de Producción',
    plural: 'Órdenes de Producción',
  },
  admin: {
    useAsTitle: 'orderNumber',
    group: 'Inventario & Producción',
    defaultColumns: [
      'orderNumber',
      'product',
      'quantityPlanned',
      'quantityProduced',
      'status',
      'sourceWarehouse',
      'targetWarehouse',
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
    update: ({ req: { user } }) =>
      Boolean(
        user?.role === 'super-admin' ||
          user?.role === 'tenant-admin' ||
          user?.role === 'supervisor',
      ),
    delete: ({ req: { user } }) => {
      if (user?.role !== 'super-admin' && user?.role !== 'tenant-admin') {
        return false;
      }
      return {
        status: {
          in: ['draft', 'cancelled'],
        },
      };
    },
  },
  hooks: {
    beforeValidate: [beforeValidateProductionOrder],
    afterChange: [afterChangeProductionOrder],
    beforeDelete: [beforeDeleteProductionOrder],
  },
  fields: [
    {
      name: 'orderNumber',
      label: 'Número de Orden de Producción',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'product',
      label: 'Producto Terminado a Fabricar',
      type: 'relationship',
      relationTo: 'products',
      required: true,
      index: true,
    },
    {
      name: 'bom',
      label: 'Fórmula / Receta (BOM) Utilizada',
      type: 'relationship',
      relationTo: 'bill-of-materials',
      required: true,
      index: true,
      filterOptions: ({ siblingData }) => {
        const prodId = extractId((siblingData as Record<string, unknown>)?.product);
        if (!prodId) return true;
        return {
          product: {
            equals: prodId,
          },
        };
      },
    },
    {
      name: 'quantityPlanned',
      label: 'Cantidad Planificada a Producir',
      type: 'number',
      required: true,
      min: 0.0001,
    },
    {
      name: 'quantityProduced',
      label: 'Cantidad Real Producida / Obtenida',
      type: 'number',
      min: 0,
    },
    {
      name: 'sourceWarehouse',
      label: 'Almacén Origen de Insumos / Materia Prima',
      type: 'relationship',
      relationTo: 'warehouses',
      required: true,
      index: true,
    },
    {
      name: 'targetWarehouse',
      label: 'Almacén Destino de Producto Terminado',
      type: 'relationship',
      relationTo: 'warehouses',
      required: true,
      index: true,
    },
    {
      name: 'status',
      label: 'Estado de la Orden',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [
        { label: 'Borrador', value: 'draft' },
        { label: 'Planificada', value: 'planned' },
        { label: 'En Proceso', value: 'in_progress' },
        { label: 'Completada / Fabricada', value: 'completed' },
        { label: 'Cancelada', value: 'cancelled' },
      ],
    },
    {
      name: 'startDate',
      label: 'Fecha de Inicio de Fabricación',
      type: 'date',
    },
    {
      name: 'completionDate',
      label: 'Fecha de Finalización',
      type: 'date',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'totalCostUSD',
      label: 'Costo Total de Producción (USD)',
      type: 'number',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'unitCostUSD',
      label: 'Costo Unitario Resultante (USD)',
      type: 'number',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'assignedTo',
      label: 'Operador / Responsable de Turno',
      type: 'relationship',
      relationTo: 'users',
    },
    {
      name: 'notes',
      label: 'Observaciones / Control de Calidad',
      type: 'textarea',
    },
  ],
  timestamps: true,
};
