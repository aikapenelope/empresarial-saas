import type { CollectionConfig } from 'payload';
import { getUserTenantIds } from '../utilities/inventoryLedger';

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  labels: {
    singular: 'Usuario',
    plural: 'Usuarios',
  },
  admin: {
    useAsTitle: 'email',
    group: 'Administración',
    defaultColumns: ['name', 'email', 'role', 'createdAt'],
  },
  access: {
    // Aislamiento multi-inquilino: cada usuario sólo ve miembros de SUS
    // inquilinos (emails, roles, membresías); super-admin ve toda la plataforma.
    read: ({ req: { user } }) => {
      if (!user) return false;
      if (user.role === 'super-admin') return true;
      const tenantIds = getUserTenantIds(user);
      if (tenantIds.length === 0) return false;
      return {
        'tenants.tenant': { in: tenantIds },
      };
    },
    create: ({ req: { user } }) =>
      Boolean(user?.role === 'super-admin' || user?.role === 'tenant-admin'),
    update: ({ req: { user } }) => {
      if (user?.role === 'super-admin') return true;
      return { id: { equals: user?.id } };
    },
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
      name: 'password',
      type: 'text',
      hidden: true,
      access: {
        update: ({ req: { user } }) => user?.role === 'super-admin',
      },
    },
    {
      name: 'role',
      label: 'Rol en la Plataforma',
      type: 'select',
      required: true,
      defaultValue: 'employee',
      saveToJWT: true,
      options: [
        { label: 'Super Administrador (Plataforma Global)', value: 'super-admin' },
        { label: 'Administrador de Empresa (Tenant Admin)', value: 'tenant-admin' },
        { label: 'Supervisor / Ventas', value: 'supervisor' },
        { label: 'Vendedor / Representante Comercial', value: 'vendor' },
        { label: 'Cajero / Operador', value: 'cashier' },
        { label: 'Empleado / Consulta', value: 'employee' },
      ],
      access: {
        update: ({ req: { user } }) => user?.role === 'super-admin',
      },
    },
  ],
  timestamps: true,
};
