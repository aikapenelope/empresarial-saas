import type { CollectionConfig } from 'payload';

export const Tenants: CollectionConfig = {
  slug: 'tenants',
  labels: {
    singular: 'Empresa / Inquilino',
    plural: 'Empresas / Inquilinos',
  },
  admin: {
    useAsTitle: 'name',
    group: 'Administración',
    defaultColumns: ['name', 'slug', 'rifFiscal', 'createdAt'],
  },
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) => Boolean(user?.role === 'super-admin'),
    update: ({ req: { user } }) => {
      if (user?.role === 'super-admin') return true;
      if (user?.role === 'tenant-admin') {
        const userTenants = (user as { tenants?: Array<{ tenant: number | { id: number } }> })?.tenants || [];
        const tenantIds = userTenants
          .map((t) => (typeof t.tenant === 'object' && t.tenant !== null ? t.tenant.id : t.tenant))
          .filter(Boolean);
        return {
          id: {
            in: tenantIds,
          },
        };
      }
      return false;
    },
    delete: ({ req: { user } }) => Boolean(user?.role === 'super-admin'),
  },
  fields: [
    {
      name: 'name',
      label: 'Nombre de la Empresa',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'slug',
      label: 'Slug Único / Identificador',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'rifFiscal',
      label: 'RIF / Registro Tributario',
      type: 'text',
      index: true,
    },
    {
      name: 'phone',
      label: 'WhatsApp Oficial de Notificaciones',
      type: 'text',
    },
    {
      name: 'currencyConfig',
      label: 'Configuración Cambiaria',
      type: 'group',
      fields: [
        {
          name: 'baseCurrency',
          label: 'Moneda Base de Referencia',
          type: 'select',
          defaultValue: 'USD',
          options: [
            { label: 'Dólares Estadounidenses (USD)', value: 'USD' },
            { label: 'Bolívares (VES)', value: 'VES' },
          ],
        },
        {
          name: 'manualExchangeRate',
          label: 'Tasa Manual Fija (USD a VES)',
          type: 'number',
          defaultValue: 0,
        },
        {
          name: 'autoSyncRate',
          label: 'Sincronizar Tasa Automática (BCV / Paralelo)',
          type: 'checkbox',
          defaultValue: true,
        },
      ],
    },
  ],
  timestamps: true,
};
