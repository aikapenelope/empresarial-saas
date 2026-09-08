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

const beforeValidatePayment: CollectionBeforeValidateHook = async ({ data, req }) => {
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

  // Financial invariant validations
  if (Array.isArray(data.allocations) && data.allocations.length > 0) {
    const customerId = extractId(data.customer);
    let totalAllocated = 0;

    for (const alloc of data.allocations) {
      const allocatedAmount = Number(alloc.allocatedAmountUSD) || 0;
      if (allocatedAmount <= 0) {
        throw new Error('El monto asignado a cada factura debe ser mayor a cero.');
      }
      totalAllocated += allocatedAmount;

      const invoiceId = extractId(alloc.invoice);
      if (invoiceId) {
        const invoice = await req.payload.findByID({
          collection: 'invoices',
          id: invoiceId,
          depth: 0,
          req,
        });

        if (!invoice) {
          throw new Error(`La factura con ID ${invoiceId} asignada en el cobro no existe.`);
        }

        if (customerId && extractId(invoice.customer) !== customerId) {
          throw new Error(
            `La factura ${invoice.invoiceNumber || invoiceId} pertenece a otro cliente y no puede ser abonada.`,
          );
        }

        if (invoice.status === 'voided') {
          throw new Error(
            `La factura ${invoice.invoiceNumber || invoiceId} está anulada y no puede recibir abonos.`,
          );
        }

        const paymentTenantId = extractId(data.tenant);
        const invoiceTenantId = extractId(invoice.tenant);
        if (
          paymentTenantId &&
          invoiceTenantId &&
          String(paymentTenantId) !== String(invoiceTenantId)
        ) {
          throw new Error(
            `La factura ${invoice.invoiceNumber || invoiceId} pertenece a otro inquilino y no puede ser abonada en este cobro.`,
          );
        }
      }
    }

    if (totalAllocated > (Number(data.totalUSD) || 0) + 0.01) {
      throw new Error(
        `El total asignado a facturas ($${totalAllocated.toFixed(2)} USD) no puede exceder el monto total del pago ($${(Number(data.totalUSD) || 0).toFixed(2)} USD).`,
      );
    }
  }

  // Cash Register and Shift Session validations
  const tenantId = extractId(data.tenant);
  const registerId = extractId(data.cashRegister);
  let closureId = extractId(data.cashClosure);

  if (registerId && !closureId) {
    const openShift = await req.payload.find({
      collection: 'cash-closures',
      where: {
        and: [
          { cashRegister: { equals: registerId } },
          { status: { equals: 'open' } },
        ],
      },
      limit: 1,
      depth: 0,
      req,
    });
    if (openShift.totalDocs > 0) {
      closureId = openShift.docs[0].id;
      data.cashClosure = closureId;
    }
  }

  if (closureId) {
    const closure = await req.payload.findByID({
      collection: 'cash-closures',
      id: closureId,
      depth: 0,
      req,
    });
    if (!closure) {
      throw new Error(`El turno de caja con ID ${closureId} no existe.`);
    }
    if (closure.status !== 'open') {
      throw new Error(
        `El turno de caja ${closure.closureNumber || closureId} ya está cerrado o auditado. No se pueden registrar cobros en un turno cerrado.`,
      );
    }
    const closureTenantId = extractId(closure.tenant);
    if (tenantId && closureTenantId && String(tenantId) !== String(closureTenantId)) {
      throw new Error('El turno de caja seleccionado pertenece a otra empresa.');
    }
  }

  return data;
};

const afterChangePayment: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
}) => {
  if (req.context?.skipBalanceRecalculation) return doc;

  const currentCustomerId = extractId(doc.customer);
  const currentTenantId = extractId(doc.tenant);
  const previousCustomerId = extractId(previousDoc?.customer);
  const previousTenantId = extractId(previousDoc?.tenant);

  // If previous doc was confirmed, reverse its allocations first
  if (previousDoc?.status === 'confirmed' && Array.isArray(previousDoc.allocations)) {
    await reversePaymentAllocations(previousDoc.allocations as PaymentAllocation[], req, {
      customerId: previousCustomerId,
      tenantId: previousTenantId,
    });
  }

  // If current doc is confirmed, apply its allocations
  if (doc.status === 'confirmed' && Array.isArray(doc.allocations)) {
    await applyPaymentAllocations(doc.allocations as PaymentAllocation[], req, {
      customerId: currentCustomerId,
      tenantId: currentTenantId,
    });
  }

  if (currentCustomerId) {
    await recalculateCustomerBalance(currentCustomerId, req);
  }

  if (previousCustomerId && previousCustomerId !== currentCustomerId) {
    await recalculateCustomerBalance(previousCustomerId, req);
  }

  return doc;
};

const beforeDeletePayment: CollectionBeforeDeleteHook = async ({ id: _id, req }) => {
  // Read document before deletion to reverse allocations atomically
  const doc = await req.payload.findByID({
    collection: 'customer-payments',
    id: _id,
    depth: 0,
    req,
  });

  if (doc?.status === 'confirmed' && Array.isArray(doc.allocations)) {
    await reversePaymentAllocations(doc.allocations as PaymentAllocation[], req, {
      customerId: extractId(doc.customer),
      tenantId: extractId(doc.tenant),
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
            { label: 'Punto de Venta / Tarjeta (VES)', value: 'pos_ves' },
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
      name: 'cashRegister',
      label: 'Caja Registradora',
      type: 'relationship',
      relationTo: 'cash-registers',
      index: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'cashClosure',
      label: 'Turno de Caja / Cierre',
      type: 'relationship',
      relationTo: 'cash-closures',
      index: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'notes',
      label: 'Notas del Recibo',
      type: 'textarea',
    },
  ],
  timestamps: true,
};
