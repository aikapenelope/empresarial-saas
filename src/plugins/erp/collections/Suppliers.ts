import type { CollectionConfig } from 'payload';

export const Suppliers: CollectionConfig = {
  slug: 'suppliers',
  labels: {
    singular: 'Proveedor',
    plural: 'Proveedores / Cuentas por Pagar',
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'rifTaxId', 'phone', 'currentDebtUSD', 'overdueDebtUSD'],
    group: 'Proveedores & CxP',
  },
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => Boolean(user?.role === 'super-admin'),
  },
  fields: [
    {
      name: 'name',
      label: 'Razón Social / Proveedor',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'legalName',
      label: 'Nombre Comercial',
      type: 'text',
    },
    {
      name: 'rifTaxId',
      label: 'RIF / Identificación Fiscal',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'phone',
      label: 'Teléfono de Contacto (WhatsApp)',
      type: 'text',
      required: true,
    },
    {
      name: 'email',
      label: 'Correo Electrónico',
      type: 'email',
    },
    {
      name: 'contactPerson',
      label: 'Persona de Contacto / Asesor Comercial',
      type: 'text',
    },
    {
      name: 'creditConfig',
      label: 'Condiciones de Crédito Otorgadas',
      type: 'group',
      fields: [
        {
          name: 'creditAllowed',
          label: 'Línea de Crédito Habilitada',
          type: 'checkbox',
          defaultValue: false,
        },
        {
          name: 'creditDays',
          label: 'Días de Crédito Otorgados',
          type: 'number',
          defaultValue: 30,
          admin: {
            condition: (_data, siblingData) => Boolean(siblingData?.creditAllowed),
          },
        },
        {
          name: 'creditLimitUSD',
          label: 'Límite de Crédito Autorizado (USD)',
          type: 'number',
          defaultValue: 0,
          admin: {
            condition: (_data, siblingData) => Boolean(siblingData?.creditAllowed),
          },
        },
      ],
    },
    // --- Saldos de Cartera Pasiva (Gobernados por Hooks) ---
    {
      name: 'currentDebtUSD',
      label: 'Deuda Total a Pagar (USD)',
      type: 'number',
      defaultValue: 0,
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'currentDebtVES',
      label: 'Deuda Total Equivalente (Bs)',
      type: 'number',
      defaultValue: 0,
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'overdueDebtUSD',
      label: 'Deuda Vencida (USD)',
      type: 'number',
      defaultValue: 0,
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'lastPaymentDate',
      label: 'Fecha del Último Pago Realizado',
      type: 'date',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'paymentInstructions',
      label: 'Instrucciones Bancarias de Pago del Proveedor',
      type: 'textarea',
      admin: {
        description: 'Cuentas bancarias, beneficiario, RIF, correo para confirmaciones de pago.',
      },
    },
    {
      name: 'address',
      label: 'Dirección o Depósito del Proveedor',
      type: 'textarea',
    },
    {
      name: 'notes',
      label: 'Observaciones / Acuerdos Comerciales',
      type: 'textarea',
    },
  ],
};
