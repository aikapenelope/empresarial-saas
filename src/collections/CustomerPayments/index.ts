import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeDeleteHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
} from 'payload';
import {
  applyPaymentAllocations,
  extractId,
  recalculateCustomerBalance,
  reversePaymentAllocations,
  type PaymentAllocation,
} from '../../utilities/financeLedger';

const beforeValidatePayment: CollectionBeforeValidateHook = ({ data }) => {
  if (!data) return data;

  if (Array.isArray(data.methods)) {
    let sumTotalUSD = 0;
    data.methods = data.methods.map((methodItem) => {
      const amount = Number(methodItem.amount) || 0;
      const rate = Number(methodItem.exchangeRate) || 1;
      let amountUSD = amount;

      if (methodItem.currency === 'VES') {
        amountUSD = rate > 0 ? Number((amount / rate).toFixed(2)) : 0;
      } else {
        amountUSD = Number(amount.toFixed(2));
      }

      sumTotalUSD += amountUSD;
      return {
        ...methodItem,
        amountUSD,
      };
    });

    data.totalUSD = Number(sumTotalUSD.toFixed(2));
  }

  return data;
};

const afterChangePayment: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
}) => {
  if (req.context?.skipBalanceRecalculation) return doc;

  // If previous doc was confirmed, reverse its allocations first
  if (previousDoc?.status === 'confirmed' && Array.isArray(previousDoc.allocations)) {
    await reversePaymentAllocations(previousDoc.allocations as PaymentAllocation[], req);
  }

  // If current doc is confirmed, apply its allocations
  if (doc.status === 'confirmed' && Array.isArray(doc.allocations)) {
    await applyPaymentAllocations(doc.allocations as PaymentAllocation[], req);
  }

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

const beforeDeletePayment: CollectionBeforeDeleteHook = async ({ id: _id, req }) => {
  // Read document before deletion to reverse allocations
  try {
    const doc = await req.payload.findByID({
      collection: 'customer-payments',
      id: _id,
      depth: 0,
      req,
      context: {
        ...req.context,
        skipBalanceRecalculation: true,
      },
    });

    if (doc?.status === 'confirmed' && Array.isArray(doc.allocations)) {
      await reversePaymentAllocations(doc.allocations as PaymentAllocation[], req);
    }
  } catch (error) {
    req.payload.logger.error({
      err: error,
      message: `Failed to reverse payment allocations during beforeDelete for payment ${_id}`,
    });
  }
};

const afterDeletePayment: CollectionAfterDeleteHook = async ({ doc, req }) => {
  if (req.context?.skipBalanceRecalculation) return doc;

  const customerId = extractId(doc?.customer);
  if (customerId) {
    await recalculateCustomerBalance(customerId, req);
  }

  return doc;
};

export const CustomerPayments: CollectionConfig = {
  slug: 'customer-payments',
  labels: {
    singular: 'Abono / Cobranza',
    plural: 'Abonos / Cobranzas',
  },
  admin: {
    useAsTitle: 'paymentNumber',
    group: 'Finanzas & CRM',
    defaultColumns: ['paymentNumber', 'customer', 'totalUSD', 'paymentDate', 'status'],
  },
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) =>
      Boolean(user?.role === 'super-admin' || user?.role === 'tenant-admin'),
  },
  hooks: {
    beforeValidate: [beforeValidatePayment],
    afterChange: [afterChangePayment],
    beforeDelete: [beforeDeletePayment],
    afterDelete: [afterDeletePayment],
  },
  fields: [
    {
      name: 'paymentNumber',
      label: 'Número de Recibo / Comprobante de Cobro',
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
      name: 'paymentDate',
      label: 'Fecha del Abono / Pago',
      type: 'date',
      required: true,
      defaultValue: () => new Date().toISOString(),
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
    {
      name: 'status',
      label: 'Estado de la Cobranza',
      type: 'select',
      required: true,
      defaultValue: 'confirmed',
      options: [
        { label: 'Por Confirmar / En Revisión', value: 'pending' },
        { label: 'Confirmado / Aplicado', value: 'confirmed' },
        { label: 'Rechazado / Reversado', value: 'rejected' },
      ],
    },
    {
      name: 'methods',
      label: 'Desglose Multimoneda / Métodos de Pago',
      type: 'array',
      required: true,
      minRows: 1,
      fields: [
        {
          name: 'method',
          label: 'Método / Canal',
          type: 'select',
          required: true,
          options: [
            { label: 'Efectivo Dólares (USD)', value: 'cash_usd' },
            { label: 'Efectivo Bolívares (VES)', value: 'cash_ves' },
            { label: 'Zelle (USD)', value: 'zelle' },
            { label: 'Pago Móvil (VES)', value: 'pago_movil' },
            { label: 'Transferencia Bancaria (VES)', value: 'transfer_ves' },
            { label: 'Binance Pay / USDT', value: 'binance' },
          ],
        },
        {
          name: 'currency',
          label: 'Moneda Recibida',
          type: 'select',
          required: true,
          defaultValue: 'USD',
          options: [
            { label: 'Dólares (USD)', value: 'USD' },
            { label: 'Bolívares (VES)', value: 'VES' },
          ],
        },
        {
          name: 'amount',
          label: 'Monto Percibido en la Moneda',
          type: 'number',
          required: true,
          min: 0.01,
        },
        {
          name: 'exchangeRate',
          label: 'Tasa de Conversión aplicada a USD',
          type: 'number',
          required: true,
          defaultValue: 1,
          min: 0.0001,
        },
        {
          name: 'amountUSD',
          label: 'Equivalente Neto en USD',
          type: 'number',
          admin: {
            readOnly: true,
          },
        },
        {
          name: 'reference',
          label: 'Referencia / Confirmación Bancaria',
          type: 'text',
        },
        {
          name: 'receipt',
          label: 'Comprobante Digital Adjunto',
          type: 'upload',
          relationTo: 'media',
        },
      ],
    },
    {
      name: 'totalUSD',
      label: 'Monto Total Percibido (USD)',
      type: 'number',
      required: true,
      min: 0.01,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'allocations',
      label: 'Asignación a Facturas (CxC)',
      type: 'array',
      fields: [
        {
          name: 'invoice',
          label: 'Factura a Abonar',
          type: 'relationship',
          relationTo: 'invoices',
          required: true,
        },
        {
          name: 'allocatedAmountUSD',
          label: 'Monto Abonado a la Factura (USD)',
          type: 'number',
          required: true,
          min: 0.01,
        },
      ],
    },
    {
      name: 'notes',
      label: 'Notas del Recibo',
      type: 'textarea',
    },
  ],
  timestamps: true,
};
