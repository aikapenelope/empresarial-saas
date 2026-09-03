import type { CollectionConfig } from 'payload';
import { executeProductionOrderCompletion } from '../hooks/production';

export const ProductionOrders: CollectionConfig = {
  slug: 'production-orders',
  labels: {
    singular: 'Orden de Fabricación',
    plural: 'Órdenes de Fabricación',
  },
  admin: {
    useAsTitle: 'orderNumber',
    defaultColumns: ['orderNumber', 'finishedProduct', 'plannedQuantity', 'status', 'scheduledDate', 'completedDate'],
    group: 'Producción & Fabricación',
  },
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => Boolean(user?.role === 'super-admin'),
  },
  hooks: {
    beforeChange: [
      async ({ data, req, operation }) => {
        if (!data) return data;

        if (operation === 'create' && !data.orderNumber) {
          const timestamp = Date.now().toString().slice(-6);
          const random = Math.floor(Math.random() * 900 + 100);
          data.orderNumber = `OP-${timestamp}-${random}`;
        }

        // Si finishedProduct no está seteado, leer del BOM
        if (!data.finishedProduct && data.bom) {
          try {
            const bomDoc = await req.payload.findByID({
              collection: 'bill-of-materials',
              id: String(data.bom),
              depth: 0,
              req,
            });
            if (bomDoc?.finishedProduct) {
              data.finishedProduct = bomDoc.finishedProduct;
            }
          } catch {
            // Ignorar si no resuelve
          }
        }

        // Si pasa a completada y no hay cantidad real, usar la planificada
        if (data.status === 'completed' && !data.producedQuantity) {
          data.producedQuantity = data.plannedQuantity;
        }

        return data;
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, req }) => {
        if (!doc) return;

        // Disparar la ejecución atómica solo cuando cambia a 'completed' por primera vez
        if (
          doc.status === 'completed' &&
          previousDoc?.status !== 'completed' &&
          !req.context?.skipProductionExecution
        ) {
          await executeProductionOrderCompletion({ orderDoc: doc, req });
        }
      },
    ],
  },
  fields: [
    {
      name: 'orderNumber',
      label: 'N° Orden de Producción',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'bom',
      label: 'Fórmula BOM a Utilizar',
      type: 'relationship',
      relationTo: 'bill-of-materials',
      required: true,
      index: true,
    },
    {
      name: 'finishedProduct',
      label: 'Producto Terminado',
      type: 'relationship',
      relationTo: 'products',
      required: true,
      index: true,
      filterOptions: {
        productType: { equals: 'manufactured' },
      },
    },
    {
      name: 'sourceWarehouse',
      label: 'Almacén de Materias Primas (Origen)',
      type: 'relationship',
      relationTo: 'warehouses',
      required: true,
    },
    {
      name: 'targetWarehouse',
      label: 'Almacén de Producto Terminado (Destino)',
      type: 'relationship',
      relationTo: 'warehouses',
      required: true,
    },
    {
      name: 'plannedQuantity',
      label: 'Cantidad Planificada a Producir',
      type: 'number',
      required: true,
      defaultValue: 1,
      min: 1,
    },
    {
      name: 'producedQuantity',
      label: 'Cantidad Real Terminada',
      type: 'number',
      admin: {
        description: 'Cantidad física efectivamente terminada en la corrida de producción.',
      },
    },
    {
      name: 'status',
      label: 'Estado de la Orden',
      type: 'select',
      defaultValue: 'draft',
      options: [
        { label: 'Borrador', value: 'draft' },
        { label: 'Planificada / En Espera de Insumos', value: 'planned' },
        { label: 'En Proceso en Planta', value: 'in_progress' },
        { label: 'Completada / Finalizada', value: 'completed' },
        { label: 'Cancelada', value: 'cancelled' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'scheduledDate',
      label: 'Fecha Programada',
      type: 'date',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'completedDate',
      label: 'Fecha de Finalización',
      type: 'date',
      admin: {
        position: 'sidebar',
      },
    },
    // --- Costos Reales Obtenidos de la Corrida ---
    {
      name: 'actualCosts',
      label: 'Costeo Real de Fabricación',
      type: 'group',
      fields: [
        {
          name: 'actualTotalCostUSD',
          label: 'Costo Total Real del Lote (USD)',
          type: 'number',
          admin: {
            readOnly: true,
          },
        },
        {
          name: 'actualUnitCostUSD',
          label: 'Costo Unitario Real de la Corrida (USD)',
          type: 'number',
          admin: {
            readOnly: true,
          },
        },
      ],
    },
    {
      name: 'notes',
      label: 'Bitácora y Observaciones de Planta',
      type: 'textarea',
    },
  ],
};
