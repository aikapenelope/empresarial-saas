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
    imageSizes: [
      {
        name: 'thumbnail',
        width: 400,
        height: 400,
        position: 'centre',
        formatOptions: {
          format: 'webp',
          options: { quality: 80 },
        },
      },
      {
        name: 'card',
        width: 800,
        height: 800,
        position: 'centre',
        formatOptions: {
          format: 'webp',
          options: { quality: 80 },
        },
      },
    ],
    adminThumbnail: 'thumbnail',
  },
  access: {
    // Sprint 49: Lectura pública para que las imágenes de productos se sirvan en el catálogo web
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
