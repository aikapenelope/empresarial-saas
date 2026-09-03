import type { CollectionConfig } from 'payload';

export const Categories: CollectionConfig = {
  slug: 'categories',
  labels: {
    singular: 'Categoría',
    plural: 'Categorías',
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'parentCategory'],
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
      label: 'Nombre de la Categoría',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'slug',
      label: 'Slug URL',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'parentCategory',
      label: 'Categoría Padre',
      type: 'relationship',
      relationTo: 'categories',
    },
    {
      name: 'description',
      label: 'Descripción',
      type: 'textarea',
    },
  ],
};
