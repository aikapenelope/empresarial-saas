import type { CollectionConfig } from 'payload';

/**
 * Conteos cíclicos de inventario (Sprint 12). Flujo: crear (snapshot de existencias
 * del sistema) → contar (cargar cantidades físicas) → completar (ajustes por Kardex
 * vía Server Action transaccional). Los ajustes se registran como movimientos
 * `adjustment_positive/negative` — el Kardex sigue siendo la única vía de alterar stock.
 */
export const InventoryCounts: CollectionConfig = {
  slug: 'inventory-counts',
  labels: {
    singular: 'Conteo de Inventario',
    plural: 'Conteos Cíclicos',
  },
  admin: {
    useAsTitle: 'id',
    group: 'Inventario & Producción',
    defaultColumns: ['warehouse', 'status', 'itemsCount', 'createdAt', 'completedAt'],
    description: 'Conteo físico por almacén con snapshot del sistema y ajustes por Kardex al completar.',
  },
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) =>
      Boolean(
        user?.role === 'super-admin' ||
          user?.role === 'tenant-admin' ||
          user?.role === 'supervisor',
      ),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) =>
      Boolean(user?.role === 'super-admin' || user?.role === 'tenant-admin'),
  },
  fields: [
    {
      name: 'warehouse',
      label: 'Almacén Contado',
      type: 'relationship',
      relationTo: 'warehouses',
      required: true,
      index: true,
    },
    {
      name: 'status',
      label: 'Estado del Conteo',
      type: 'select',
      required: true,
      defaultValue: 'in_progress',
      options: [
        { label: 'En Progreso', value: 'in_progress' },
        { label: 'Completado', value: 'completed' },
      ],
    },
    {
      name: 'items',
      label: 'Líneas del Conteo',
      type: 'array',
      required: true,
      minRows: 1,
      fields: [
        {
          name: 'product',
          label: 'Producto',
          type: 'relationship',
          relationTo: 'products',
          required: true,
          index: true,
        },
        {
          name: 'systemQty',
          label: 'Existencia del Sistema (Snapshot)',
          type: 'number',
          required: true,
          admin: {
            readOnly: true,
          },
        },
        {
          name: 'countedQty',
          label: 'Cantidad Contada (Físico)',
          type: 'number',
          min: 0,
        },
        {
          name: 'difference',
          label: 'Diferencia',
          type: 'number',
          admin: {
            readOnly: true,
          },
        },
      ],
    },
    {
      name: 'notes',
      label: 'Notas del Conteo',
      type: 'textarea',
    },
    {
      name: 'openedBy',
      label: 'Abierto Por',
      type: 'relationship',
      relationTo: 'users',
      index: true,
    },
    {
      name: 'completedBy',
      label: 'Completado Por',
      type: 'relationship',
      relationTo: 'users',
      index: true,
    },
    {
      name: 'completedAt',
      label: 'Completado El',
      type: 'date',
      admin: {
        position: 'sidebar',
      },
    },
  ],
  timestamps: true,
};
