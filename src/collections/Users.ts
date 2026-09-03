import type { CollectionConfig } from 'payload';

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  admin: {
    useAsTitle: 'email',
    group: 'Administración',
  },
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) => Boolean(user?.role === 'super-admin'),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => Boolean(user?.role === 'super-admin'),
  },
  fields: [
    {
      name: 'name',
      label: 'Nombre Completo',
      type: 'text',
      required: true,
    },
    {
      name: 'role',
      label: 'Rol de Usuario',
      type: 'select',
      required: true,
      defaultValue: 'employee',
      options: [
        { label: 'Super Administrador (Plataforma)', value: 'super-admin' },
        { label: 'Administrador de Empresa', value: 'tenant-admin' },
        { label: 'Supervisor / Ventas', value: 'supervisor' },
        { label: 'Cajero / Operador', value: 'cashier' },
        { label: 'Empleado', value: 'employee' },
      ],
      access: {
        update: ({ req: { user } }) => user?.role === 'super-admin',
      },
    },
  ],
};
