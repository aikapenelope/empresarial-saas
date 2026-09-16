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
    {
      name: 'salesConfig',
      label: 'Documento de Venta por Defecto',
      type: 'group',
      fields: [
        {
          name: 'salesDocumentDefault',
          label: 'Documento de Entrega',
          type: 'select',
          required: true,
          defaultValue: 'factura',
          admin: {
            description:
              'Escenario regulatorio venezolano 2026: en modo "nota_entrega" la entrega al cliente se documenta con Nota de Entrega y la factura pasa a ser opcional (se emite después, desde la remisión o el pedido).',
          },
          options: [
            { label: 'Nota de Entrega (factura opcional)', value: 'nota_entrega' },
            { label: 'Factura inmediata', value: 'factura' },
          ],
        },
      ],
    },
    {
      name: 'taxConfig',
      label: 'Configuración Fiscal (IVA / IGTF)',
      type: 'group',
      fields: [
        {
          name: 'generalRatePct',
          label: 'Alícuota General IVA (%)',
          type: 'number',
          defaultValue: 16,
          min: 0,
          max: 100,
          admin: {
            description:
              'Rango legal 8–16,5%: ajustable por decreto del SENIAT sin cambios de código.',
          },
        },
        {
          name: 'igtfPct',
          label: 'IGTF sobre Pagos en Divisa (%)',
          type: 'number',
          defaultValue: 3,
          min: 0,
          max: 100,
        },
        {
          name: 'applyIgtfOnFxPayments',
          label: 'Registrar IGTF en Cobros en Divisa (Zelle, Binance, Efectivo USD)',
          type: 'checkbox',
          defaultValue: true,
        },
      ],
    },
    {
      name: 'emailConfig',
      label: 'Envío Automático de Documentos (Email)',
      type: 'group',
      fields: [
        {
          name: 'autoSendQuoteEmail',
          label: 'Enviar el presupuesto automáticamente al email del cliente al crearlo',
          type: 'checkbox',
          defaultValue: true,
          admin: {
            description:
              'Requiere RESEND_API_KEY configurada. El cliente recibe un enlace público del presupuesto vía Resend; sin email del cliente no hay envío.',
          },
        },
        {
          name: 'autoSendInvoiceEmail',
          label: 'Enviar la factura automáticamente al email del cliente al emitirla',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            description:
              'Requiere RESEND_API_KEY. La factura viaja como enlace público al emitirla; sin email del cliente no hay envío.',
          },
        },
        {
          name: 'alertsEmailEnabled',
          label: 'Alertas nuevas por email (warning/critical)',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            description:
              'Digest anti-spam: un email por ciclo del evaluador con las alertas aún no notificadas. Requiere RESEND_API_KEY y dominio verificado. OFF hasta activarlo aquí.',
          },
        },
        {
          name: 'alertsEmailRecipients',
          label: 'Destinatarios de Alertas',
          type: 'array',
          labels: { singular: 'Destinatario', plural: 'Destinatarios' },
          admin: {
            description:
              'Si se deja vacío, el digest se envía a los emails de los administradores del inquilino (tenant-admin).',
          },
          fields: [
            {
              name: 'email',
              label: 'Email',
              type: 'email',
              required: true,
            },
          ],
        },
      ],
    },
    {
      name: 'storefrontConfig',
      label: 'Portal de Pedidos B2B (Catálogo Web)',
      type: 'group',
      fields: [
        {
          name: 'enabled',
          label: 'Habilitar Portal Web de Pedidos (/[tenant])',
          type: 'checkbox',
          defaultValue: false,
          access: {
            read: () => true,
            update: ({ req: { user } }) => Boolean(user?.role === 'super-admin'),
          },
          admin: {
            description:
              'Solo el Superadministrador de la plataforma puede activar o desactivar este portal comercial.',
          },
        },
        {
          name: 'whatsappOrdersNumber',
          label: 'Teléfono WhatsApp para Recepción de Pedidos',
          type: 'text',
          admin: {
            description:
              'Número en formato internacional (ej. +584121234567) al que se dirigirá el pedido cotizado.',
          },
        },
        {
          name: 'portalTitle',
          label: 'Título del Catálogo Web',
          type: 'text',
          defaultValue: 'Portal de Pedidos y Catálogo Mayorista',
        },
        {
          name: 'portalDescription',
          label: 'Descripción o Condiciones Comerciales',
          type: 'textarea',
          defaultValue:
            'Precios sujetos a cambio sin previo aviso. Despachos y condiciones acordadas con su asesor comercial.',
        },
      ],
    },
  ],
  timestamps: true,
};
