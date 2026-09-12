import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload';

/**
 * Transiciones de estado de una cotización. `converted` y `rejected` son estados
 * finales: la conversión a factura la ejecuta `convertQuoteToInvoiceAction`.
 */
const FINAL_STATUSES = new Set(['converted', 'rejected']);

const beforeValidateQuote: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  operation,
}) => {
  if (!data) return data;

  // Snapshot de tasa: lo fija la Server Action al crear (resolveEffectiveRate);
  // en updates sin items se conserva el total original con la tasa vigente del doc.
  const rate = Number(data.exchangeRateSnapshot) || Number(originalDoc?.exchangeRateSnapshot) || 1;

  // Totales desde las líneas (mismo patrón que Invoices / BOM)
  if (Array.isArray(data.items)) {
    let sumTotalUSD = 0;
    data.items = data.items.map((item) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unitPriceUSD) || 0;
      const lineTotal = Number((qty * price).toFixed(2));
      sumTotalUSD += lineTotal;
      return {
        ...item,
        totalUSD: lineTotal,
      };
    });
    data.totalUSD = Number(sumTotalUSD.toFixed(2));
    data.totalVES = Number((data.totalUSD * rate).toFixed(2));
  } else if (originalDoc?.totalUSD) {
    data.totalUSD = Number(originalDoc.totalUSD);
    data.totalVES = Number((data.totalUSD * rate).toFixed(2));
  }

  if (operation === 'create') {
    if (!data.issueDate) {
      data.issueDate = new Date().toISOString();
    }
    if (!data.status) {
      data.status = 'draft';
    }
  }

  // Inmutabilidad de estados finales
  if (operation === 'update' && originalDoc) {
    if (FINAL_STATUSES.has(originalDoc.status)) {
      throw new Error(
        originalDoc.status === 'converted'
          ? 'Una cotización convertida a factura es inmutable.'
          : 'Una cotización rechazada no puede cambiar de estado.',
      );
    }
  }

  return data;
};

export const Quotes: CollectionConfig = {
  slug: 'quotes',
  labels: {
    singular: 'Cotización',
    plural: 'Cotizaciones',
  },
  admin: {
    useAsTitle: 'quoteNumber',
    group: 'Finanzas & CRM',
    defaultColumns: ['quoteNumber', 'customer', 'status', 'totalUSD', 'validUntil', 'createdAt'],
  },
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) =>
      Boolean(user?.role === 'super-admin' || user?.role === 'tenant-admin'),
  },
  hooks: {
    beforeValidate: [beforeValidateQuote],
  },
  fields: [
    {
      name: 'quoteNumber',
      label: 'Número de Cotización',
      type: 'text',
      required: true,
      index: true,
      admin: {
        description: 'Correlativo COT-##### generado por la Server Action (numeración con lock).',
      },
    },
    {
      name: 'customer',
      label: 'Cliente',
      type: 'relationship',
      relationTo: 'customers',
      required: true,
      index: true,
    },
    {
      name: 'items',
      label: 'Líneas de Detalle Cotizadas',
      type: 'array',
      required: true,
      minRows: 1,
      fields: [
        {
          name: 'product',
          label: 'Producto de Catálogo',
          type: 'relationship',
          relationTo: 'products',
          index: true,
          admin: {
            description: 'Opcional: las líneas sin producto son conceptos de texto libre.',
          },
        },
        {
          name: 'sku',
          label: 'Código / SKU',
          type: 'text',
        },
        {
          name: 'description',
          label: 'Descripción',
          type: 'text',
          required: true,
        },
        {
          name: 'quantity',
          label: 'Cantidad',
          type: 'number',
          required: true,
          min: 0.001,
          defaultValue: 1,
        },
        {
          name: 'unitPriceUSD',
          label: 'Precio Unitario (USD)',
          type: 'number',
          required: true,
          min: 0,
          defaultValue: 0,
        },
        {
          name: 'totalUSD',
          label: 'Total Línea (USD)',
          type: 'number',
          admin: {
            readOnly: true,
          },
        },
      ],
    },
    {
      name: 'issueDate',
      label: 'Fecha de Emisión',
      type: 'date',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'validUntil',
      label: 'Válida Hasta',
      type: 'date',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'status',
      label: 'Estado de la Cotización',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [
        { label: 'Borrador', value: 'draft' },
        { label: 'Enviada al Cliente', value: 'sent' },
        { label: 'Aceptada', value: 'accepted' },
        { label: 'Rechazada', value: 'rejected' },
        { label: 'Expirada', value: 'expired' },
        { label: 'Convertida a Factura', value: 'converted' },
      ],
    },
    {
      name: 'exchangeRateSnapshot',
      label: 'Tasa de Cambio al Emitir (USD a VES)',
      type: 'number',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'totalUSD',
      label: 'Total Cotizado (USD)',
      type: 'number',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'totalVES',
      label: 'Total Cotizado (VES)',
      type: 'number',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'convertedInvoice',
      label: 'Factura Generada',
      type: 'relationship',
      relationTo: 'invoices',
      index: true,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Se llena automáticamente al convertir la cotización en factura.',
      },
    },
    {
      name: 'notes',
      label: 'Notas / Alcance Ofrecido',
      type: 'textarea',
    },
    {
      // Sprint 28: token de compartición pública (envío por email / WhatsApp).
      // 32 bytes del CSPRNG; se emite perezosamente la primera vez que se
      // comparte el documento y nunca es editable por la UI ni por REST.
      name: 'shareToken',
      label: 'Token de Compartición',
      type: 'text',
      index: true,
      unique: true,
      hidden: true,
      access: {
        create: () => false,
        update: () => false,
      },
    },
    {
      // Sprint R4 (hallazgo S1-1): caducidad del enlace público. El token es una
      // CAPACIDAD: se emite con una ventana de validez y deja de resolver al
      // vencer. Server-generated; no editable por la UI ni por REST.
      name: 'shareTokenExpiresAt',
      label: 'Caducidad del Enlace de Compartición',
      type: 'date',
      hidden: true,
      access: {
        create: () => false,
        update: () => false,
      },
    },
  ],
  timestamps: true,
};
