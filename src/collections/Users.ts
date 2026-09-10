import type { CollectionConfig } from 'payload';
import { getUserTenantIds } from '../utilities/inventoryLedger';

export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    // Blindaje de credenciales (Sprint R1 · auditoría 2026-09-10 · P1-S0-01):
    // CVE de Payload ≤3.88.0 — el access unlock por defecto permite a
    // cualquier usuario autenticado resetear lockouts AJENOS vía
    // POST /api/users/unlock/:id. maxLoginAttempts activa el lockout nativo
    // (las columnas login_attempts/lock_until existen desde init_core) y
    // access.unlock (abajo) reserva el desbloqueo al super-admin.
    maxLoginAttempts: 5,
    lockTime: 30 * 60 * 1000, // 30 minutos de bloqueo tras 5 intentos fallidos
  },
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
    // Mitigación del CVE de account-unlock (Sprint R1): el desbloqueo de
    // cuentas queda reservado al super-admin (admin panel y REST). El flujo
    // forgot-password NO pasa por esta operación: los usuarios siguen
    // pudiendo auto-recuperarse con su email.
    unlock: ({ req: { user } }) => user?.role === 'super-admin',
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
    // Sin campo `password` declarado: las colecciones auth gestionan credenciales
    // de forma nativa (salt/hash). Payload hashea `data.password` en create/update
    // sin necesidad del campo (igual que el template oficial de Payload).
    {
      name: 'name',
      label: 'Nombre Completo',
      type: 'text',
      required: true,
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
