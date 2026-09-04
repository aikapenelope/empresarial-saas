import type { CollectionConfig } from 'payload';

export const Warehouses: CollectionConfig = {
  slug: 'warehouses',
  labels: {
    singular: 'Almacén / Depósito',
    plural: 'Almacenes / Depósitos',
  },
  admin: {
    useAsTitle: 'name',
    group: 'Inventario & Producción',
    defaultColumns: ['name', 'code', 'type', 'isDefault', 'isActive'],
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
  fields: [
    {
      name: 'name',
      label: 'Nombre del Almacén',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'code',
      label: 'Código / Clave',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'type',
      label: 'Tipo de Almacén',
      type: 'select',
      required: true,
      defaultValue: 'main',
      options: [
        { label: 'Principal / Despacho', value: 'main' },
        { label: 'Materia Prima / Insumos', value: 'raw_materials' },
        { label: 'Producción / En Proceso', value: 'work_in_progress' },
        { label: 'Merma / Averías', value: 'scrap' },
        { label: 'Punto de Venta / Sucursal', value: 'retail' },
      ],
    },
    {
      name: 'location',
      label: 'Ubicación Física / Dirección',
      type: 'text',
    },
    {
      name: 'isDefault',
      label: 'Almacén por Defecto',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'isActive',
      label: 'Activo',
      type: 'checkbox',
      defaultValue: true,
    },
  ],
  timestamps: true,
};
