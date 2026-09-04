import type { CollectionConfig } from 'payload';

export const Media: CollectionConfig = {
  slug: 'media',
  labels: {
    singular: 'Archivo / Comprobante',
    plural: 'Archivos / Comprobantes',
  },
  admin: {
    useAsTitle: 'alt',
    group: 'Administración',
  },
  upload: {
    mimeTypes: ['image/*', 'application/pdf'],
  },
  access: {
    read: () => true,
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => Boolean(user?.role === 'super-admin' || user?.role === 'tenant-admin'),
  },
  fields: [
    {
      name: 'alt',
      label: 'Descripción / Texto Alternativo',
      type: 'text',
    },
  ],
  timestamps: true,
};
