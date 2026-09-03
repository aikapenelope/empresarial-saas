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
      label: 'Nombre de la Empresa',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'slug',
      label: 'Slug Único / Subruta',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'rifFiscal',
      label: 'RIF / Registro Tributario',
      type: 'text',
    },
    {
      name: 'phone',
      label: 'WhatsApp Oficial de Cobranzas',
      type: 'text',
    },
    {
      name: 'currencyConfig',
      label: 'Configuración de Moneda',
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
          label: 'Sincronizar Tasa Automática (BCV / Binance)',
          type: 'checkbox',
          defaultValue: true,
        },
      ],
    },
  ],
};
