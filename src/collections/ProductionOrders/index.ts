import type {
  CollectionAfterChangeHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
} from 'payload';
import { executeProductionOrder } from '../../utilities/inventoryLedger';

const beforeValidateProductionOrder: CollectionBeforeValidateHook = ({
  data,
  operation,
  originalDoc,
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
  if (originalDoc?.status === 'completed') {
    const requestedStatus = data.status || originalDoc.status;
    if (requestedStatus !== 'completed') {
      throw new Error(
        'Una orden de producción completada no puede cambiar de estado porque sus movimientos de inventario ya fueron asentados en el Kardex.',
      );
    }
  }

  const planned = Number(data.quantityPlanned) || Number(originalDoc?.quantityPlanned) || 0;
  if (planned <= 0) {
    throw new Error('La cantidad planificada a fabricar debe ser mayor a cero.');
  }

  // If transitioning to completed, validate quantity produced
  if (data.status === 'completed') {
    const produced = Number(data.quantityProduced) || planned;
    if (produced <= 0) {
      throw new Error('La cantidad efectivamente producida debe ser mayor a cero para completar la orden.');
    }
    data.quantityProduced = produced;
    if (!data.completionDate) {
      data.completionDate = new Date().toISOString();
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

    // Save final costs on the production order doc
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
      },
    });
  }

  return doc;
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
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) =>
      Boolean(user?.role === 'super-admin' || user?.role === 'tenant-admin'),
  },
  hooks: {
    beforeValidate: [beforeValidateProductionOrder],
    afterChange: [afterChangeProductionOrder],
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
