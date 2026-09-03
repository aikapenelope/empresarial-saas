import type { CollectionConfig } from 'payload';

export const Warehouses: CollectionConfig = {
  slug: 'warehouses',
  labels: {
    singular: 'Almacén / Depósito',
    plural: 'Almacenes / Depósitos',
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'code', 'type', 'isDefault', 'active'],
    group: 'Catálogo e Inventario',
  },
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => Boolean(user),
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
      label: 'Código de Identificación',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'type',
      label: 'Tipo de Almacén',
      type: 'select',
      defaultValue: 'general',
      options: [
        { label: 'General / Producto Terminado', value: 'general' },
        { label: 'Bodega de Materia Prima e Insumos', value: 'raw_materials' },
        { label: 'Piso de Planta / En Proceso', value: 'production_floor' },
        { label: 'Tránsito / Despacho', value: 'transit' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'isDefault',
      label: 'Almacén Principal por Defecto',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'active',
      label: 'Activo',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'address',
      label: 'Dirección o Ubicación Física',
      type: 'textarea',
    },
  ],
};
