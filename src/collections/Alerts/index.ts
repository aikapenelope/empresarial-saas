import type { CollectionConfig } from 'payload';

/**
 * Centro de alertas (Sprint 22). Las filas las genera el job programado
 * `evaluateAlerts` (escritura de sistema con overrideAccess); los operadores
 * reconocen/resuelven vía Server Actions. Idempotencia por índice único
 * (tenant, type, refId): cada condición existe una sola vez — si la condición
 * reaparece tras resolverse, el evaluador reactiva la misma fila.
 */
export const Alerts: CollectionConfig = {
  slug: 'alerts',
  labels: {
    singular: 'Alerta',
    plural: 'Alertas',
  },
  admin: {
    useAsTitle: 'message',
    group: 'Administración',
    defaultColumns: ['type', 'severity', 'message', 'acknowledgedAt', 'resolvedAt', 'createdAt'],
  },
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) =>
      Boolean(user?.role === 'super-admin' || user?.role === 'tenant-admin'),
  },
  indexes: [
    { fields: ['tenant', 'type', 'refId'], unique: true },
    { fields: ['tenant', 'resolvedAt'] },
  ],
  fields: [
    {
      name: 'type',
      label: 'Tipo de Alerta',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Stock Bajo', value: 'low_stock' },
        { label: 'Conteo con Diferencias Pendiente', value: 'inventory_diff' },
        { label: 'Variación de Tasa', value: 'rate_change' },
        { label: 'Factura Vencida', value: 'overdue_invoice' },
        { label: 'Canal con Cartera Vencida', value: 'vendor_overdue' },
      ],
    },
    {
      name: 'severity',
      label: 'Severidad',
      type: 'select',
      required: true,
      defaultValue: 'warning',
      options: [
        { label: 'Informativa', value: 'info' },
        { label: 'Advertencia', value: 'warning' },
        { label: 'Crítica', value: 'critical' },
      ],
    },
    {
      name: 'message',
      label: 'Mensaje',
      type: 'textarea',
      required: true,
    },
    {
      name: 'refCollection',
      label: 'Colección de Referencia',
      type: 'text',
      admin: {
        description: 'Slug de la colección referida (products, invoices, inventory-counts…).',
      },
    },
    {
      name: 'refId',
      label: 'ID de Referencia',
      type: 'number',
      required: true,
      defaultValue: 0,
      index: true,
      admin: {
        description: 'ID del documento referido; 0 para alertas a nivel de inquilino.',
      },
    },
    {
      name: 'acknowledgedAt',
      label: 'Reconocida En',
      type: 'date',
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'acknowledgedBy',
      label: 'Reconocida Por',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'resolvedAt',
      label: 'Resuelta En',
      type: 'date',
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Vacía = alerta activa. El evaluador reactiva la fila si la condición reaparece.',
      },
    },
  ],
  timestamps: true,
};
