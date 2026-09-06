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
    // Escalación de privilegios: el tenant-admin NO puede crear usuarios por
    // REST directo (podría fijar cualquier rol saltándose inviteUserAction).
    // Sólo se le permite a través de la Server Action, que marca el contexto
    // interno `viaInviteUserAction` y aplica sus restricciones (sin roles
    // administrativos, sólo su inquilino verificado).
    create: ({ req: { user, context } }) => {
      if (user?.role === 'super-admin') return true;
      if (user?.role === 'tenant-admin') return Boolean(context?.viaInviteUserAction);
      return false;
    },
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
        // Sólo super-admin asigna roles — en creación y en actualización.
        // La vía del tenant-admin (inviteUserAction) usa overrideAccess:true
        // con roles administrativos ya bloqueados en la propia acción.
        create: ({ req: { user } }) => user?.role === 'super-admin',
        update: ({ req: { user } }) => user?.role === 'super-admin',
      },
    },
  ],
  timestamps: true,
};
