import type { CollectionConfig } from 'payload';

export const Categories: CollectionConfig = {
  slug: 'categories',
  labels: {
    singular: 'Categoría',
    plural: 'Categorías',
  },
  admin: {
    useAsTitle: 'name',
    group: 'Inventario & Producción',
    defaultColumns: ['name', 'code', 'isActive'],
  },
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) =>
      Boolean(user?.role === 'super-admin' || user?.role === 'tenant-admin'),
  },
  fields: [
    {
      name: 'name',
      label: 'Nombre de la Categoría',
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
      name: 'description',
      label: 'Descripción',
      type: 'textarea',
    },
    {
      name: 'parentCategory',
      label: 'Categoría Superior / Padre',
      type: 'relationship',
      relationTo: 'categories',
      filterOptions: ({ id }) => {
        if (!id) return true;
        return {
          id: {
            not_equals: id,
          },
        };
      },
    },
    {
      name: 'isActive',
      label: 'Activa',
      type: 'checkbox',
      defaultValue: true,
    },
  ],
  timestamps: true,
};
