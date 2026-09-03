import type { CollectionConfig } from 'payload';

export const CashRegisters: CollectionConfig = {
  slug: 'cash-registers',
  labels: {
    singular: 'Caja Registradora',
    plural: 'Cajas Registradoras (Puntos de Cobro)',
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'code', 'warehouse', 'currentStatus', 'active'],
    group: 'Caja & Puntos de Venta',
  },
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) => Boolean(user?.role === 'super-admin' || user?.role === 'tenant-admin'),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => Boolean(user?.role === 'super-admin'),
  },
  fields: [
    {
      name: 'name',
      label: 'Nombre de la Caja / Punto de Cobro',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'code',
      label: 'Código de Caja (ej. CAJA-01)',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'warehouse',
      label: 'Sucursal / Almacén Asignado',
      type: 'relationship',
      relationTo: 'warehouses',
      required: true,
      index: true,
    },
    {
      name: 'currentStatus',
      label: 'Estado Operativo Actual',
      type: 'select',
      defaultValue: 'closed',
      options: [
        { label: 'Caja Abierta (Turno Activo)', value: 'open' },
        { label: 'Caja Cerrada', value: 'closed' },
      ],
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'active',
      label: 'Caja Habilitada',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'notes',
      label: 'Ubicación / Equipo Físico',
      type: 'textarea',
    },
  ],
};
