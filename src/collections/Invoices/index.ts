import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
} from 'payload';
import { extractId, recalculateCustomerBalance } from '../../utilities/financeLedger';

const beforeValidateInvoice: CollectionBeforeValidateHook = ({ data, operation }) => {
  if (!data) return data;

  const rate = Number(data.exchangeRateSnapshot) || 1;

  // Compute line items totals
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
  }

  // Handle balance on creation
  if (operation === 'create') {
    if (data.balanceUSD === undefined || data.balanceUSD === null) {
      if (data.status === 'paid') {
        data.balanceUSD = 0;
        data.balanceVES = 0;
      } else {
        data.balanceUSD = data.totalUSD || 0;
        data.balanceVES = data.totalVES || 0;
      }
    } else {
      data.balanceVES = Number(((Number(data.balanceUSD) || 0) * rate).toFixed(2));
    }
  } else if (operation === 'update') {
    if (data.balanceUSD !== undefined && data.balanceUSD !== null) {
      data.balanceUSD = Number(Number(data.balanceUSD).toFixed(2));
      data.balanceVES = Number((data.balanceUSD * rate).toFixed(2));

      if (data.balanceUSD <= 0.005 && data.status !== 'voided') {
        data.status = 'paid';
      }
    }

    if (data.status === 'voided') {
      data.balanceUSD = 0;
      data.balanceVES = 0;
    }
  }

  return data;
};

const afterChangeInvoice: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
}) => {
  if (req.context?.skipBalanceRecalculation) return doc;

  const currentCustomerId = extractId(doc.customer);
  if (currentCustomerId) {
    await recalculateCustomerBalance(currentCustomerId, req);
  }

  const previousCustomerId = extractId(previousDoc?.customer);
  if (previousCustomerId && previousCustomerId !== currentCustomerId) {
    await recalculateCustomerBalance(previousCustomerId, req);
  }

  return doc;
};

const afterDeleteInvoice: CollectionAfterDeleteHook = async ({ doc, req }) => {
  if (req.context?.skipBalanceRecalculation) return doc;

  const customerId = extractId(doc?.customer);
  if (customerId) {
    await recalculateCustomerBalance(customerId, req);
  }

  return doc;
};

export const Invoices: CollectionConfig = {
  slug: 'invoices',
  labels: {
    singular: 'Factura / CxC',
    plural: 'Facturas / CxC',
  },
  admin: {
    useAsTitle: 'invoiceNumber',
    group: 'Finanzas & CRM',
    defaultColumns: ['invoiceNumber', 'customer', 'status', 'totalUSD', 'balanceUSD', 'dueDate'],
  },
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) =>
      Boolean(user?.role === 'super-admin' || user?.role === 'tenant-admin'),
  },
  hooks: {
    beforeValidate: [beforeValidateInvoice],
    afterChange: [afterChangeInvoice],
    afterDelete: [afterDeleteInvoice],
  },
  fields: [
    {
      name: 'invoiceNumber',
      label: 'Número de Factura / Control',
      type: 'text',
      required: true,
      index: true,
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
      name: 'issueDate',
      label: 'Fecha de Emisión',
      type: 'date',
      required: true,
      defaultValue: () => new Date().toISOString(),
      admin: {
        date: {
          pickerAppearance: 'dayOnly',
        },
      },
    },
    {
      name: 'dueDate',
      label: 'Fecha de Vencimiento',
      type: 'date',
      required: true,
      admin: {
        date: {
          pickerAppearance: 'dayOnly',
        },
      },
    },
    {
      name: 'paymentTerms',
      label: 'Condición de Venta',
      type: 'select',
      required: true,
      defaultValue: 'cash',
      options: [
        { label: 'De Contado', value: 'cash' },
        { label: 'A Crédito', value: 'credit' },
      ],
    },
    {
      name: 'status',
      label: 'Estado de la Factura',
      type: 'select',
      required: true,
      defaultValue: 'issued',
      options: [
        { label: 'Borrador', value: 'draft' },
        { label: 'Emitida / Pendiente', value: 'issued' },
        { label: 'Abonada / Pago Parcial', value: 'partially_paid' },
        { label: 'Pagada Totalmente', value: 'paid' },
        { label: 'Anulada / Sin Efecto', value: 'voided' },
      ],
    },
    {
      name: 'exchangeRateSnapshot',
      label: 'Tasa de Cambio al Emitir (USD a VES)',
      type: 'number',
      required: true,
      defaultValue: 1,
      min: 0.0001,
    },
    {
      name: 'items',
      label: 'Líneas de Detalle / Productos o Servicios',
      type: 'array',
      required: true,
      minRows: 1,
      fields: [
        {
          name: 'sku',
          label: 'Código / SKU',
          type: 'text',
        },
        {
          name: 'description',
          label: 'Descripción del Producto o Servicio',
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
    // Financial Totals
    {
      name: 'totalUSD',
      label: 'Monto Total Factura (USD)',
      type: 'number',
      required: true,
      min: 0,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'totalVES',
      label: 'Monto Total Factura (VES)',
      type: 'number',
      required: true,
      min: 0,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'balanceUSD',
      label: 'Saldo Pendiente (USD)',
      type: 'number',
      required: true,
      min: 0,
    },
    {
      name: 'balanceVES',
      label: 'Saldo Pendiente (VES)',
      type: 'number',
      required: true,
      min: 0,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'notes',
      label: 'Observaciones / Términos de Entrega',
      type: 'textarea',
    },
  ],
  timestamps: true,
};
