import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
} from 'payload';
import {
  extractId,
  getInvoicePaidAmount,
  recalculateCustomerBalance,
} from '../../utilities/financeLedger';
import { runIsolatedContext } from '../../utilities/requestContext';

const beforeValidateInvoice: CollectionBeforeValidateHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (!data) return data;

  const rate = Number(data.exchangeRateSnapshot) || Number(originalDoc?.exchangeRateSnapshot) || 1;

  // 1. Compute line items and revised totals if items array is present
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
  } else if (data.exchangeRateSnapshot && originalDoc?.totalUSD) {
    data.totalUSD = Number(originalDoc.totalUSD);
    data.totalVES = Number((data.totalUSD * rate).toFixed(2));
  }

  // 2. Handle Creation
  if (operation === 'create') {
    if (data.status === 'paid' || data.status === 'voided') {
      data.balanceUSD = 0;
      data.balanceVES = 0;
    } else {
      const initialTotal = Number(data.totalUSD) || 0;
      data.balanceUSD =
        data.balanceUSD !== undefined && data.balanceUSD !== null
          ? Math.min(initialTotal, Number(Number(data.balanceUSD).toFixed(2)))
          : initialTotal;
      data.balanceVES = Number((data.balanceUSD * rate).toFixed(2));
    }
    return data;
  }

  // 3. Handle Update: reconcile outstanding balances and explicit status transitions
  if (operation === 'update' && originalDoc) {
    const origTotalUSD = Number(originalDoc.totalUSD) || 0;
    const currentTotalUSD = data.totalUSD !== undefined ? Number(data.totalUSD) : origTotalUSD;

    // Detect explicit status transitions
    const originalStatus = originalDoc.status as string;
    const requestedStatus = data.status || originalStatus;

    if (requestedStatus === 'voided') {
      data.status = 'voided';
      data.balanceUSD = 0;
      data.balanceVES = 0;
      return data;
    }

    if (requestedStatus === 'paid') {
      data.status = 'paid';
      data.balanceUSD = 0;
      data.balanceVES = 0;
      return data;
    }

    // Un-voiding a previously voided invoice: reconstruct actual historical payments
    if (originalStatus === 'voided' && requestedStatus !== 'voided') {
      const actualPaidUSD = await getInvoicePaidAmount(originalDoc.id, req);
      const restoredBalUSD = Math.max(0, Number((currentTotalUSD - actualPaidUSD).toFixed(2)));
      data.balanceUSD = restoredBalUSD;
      data.balanceVES = Number((restoredBalUSD * rate).toFixed(2));
      data.status =
        restoredBalUSD <= 0.005
          ? 'paid'
          : actualPaidUSD > 0
            ? 'partially_paid'
            : requestedStatus === 'draft'
              ? 'draft'
              : 'issued';
      return data;
    }

    // Reopening a previously paid invoice to issued or draft
    if (originalStatus === 'paid' && (requestedStatus === 'issued' || requestedStatus === 'draft')) {
      const actualPaidUSD = await getInvoicePaidAmount(originalDoc.id, req);
      const restoredBalUSD = Math.max(0, Number((currentTotalUSD - actualPaidUSD).toFixed(2)));
      data.balanceUSD =
        data.balanceUSD !== undefined && Number(data.balanceUSD) > 0
          ? Math.min(restoredBalUSD, Number(Number(data.balanceUSD).toFixed(2)))
          : restoredBalUSD;
      data.balanceVES = Number((data.balanceUSD * rate).toFixed(2));
      data.status = requestedStatus;
      return data;
    }

    // Calculate historical amount already paid toward this invoice
    const priorPaidUSD = Math.max(
      0,
      Number((origTotalUSD - (Number(originalDoc.balanceUSD) || 0)).toFixed(2)),
    );

    // If invoice items or exchange rate changed, dynamically reconcile remaining balance
    const itemsChanged = Array.isArray(data.items);
    const rateChanged =
      data.exchangeRateSnapshot !== undefined &&
      data.exchangeRateSnapshot !== originalDoc.exchangeRateSnapshot;

    if (itemsChanged || rateChanged) {
      const reconciledBalUSD = Math.max(0, Number((currentTotalUSD - priorPaidUSD).toFixed(2)));
      data.balanceUSD = reconciledBalUSD;
      data.balanceVES = Number((reconciledBalUSD * rate).toFixed(2));

      if (reconciledBalUSD <= 0.005) {
        data.status = 'paid';
      } else if (reconciledBalUSD < currentTotalUSD) {
        data.status = 'partially_paid';
      } else {
        data.status = requestedStatus === 'draft' ? 'draft' : 'issued';
      }
      return data;
    }

    // If balanceUSD was directly supplied
    if (data.balanceUSD !== undefined && data.balanceUSD !== null) {
      data.balanceUSD = Math.max(
        0,
        Math.min(currentTotalUSD, Number(Number(data.balanceUSD).toFixed(2))),
      );
      data.balanceVES = Number((data.balanceUSD * rate).toFixed(2));

      if (data.balanceUSD <= 0.005 && requestedStatus !== 'draft') {
        data.status = 'paid';
      } else if (data.balanceUSD < currentTotalUSD && requestedStatus !== 'draft') {
        data.status = 'partially_paid';
      }
    } else {
      data.balanceVES = Number(((Number(originalDoc.balanceUSD) || 0) * rate).toFixed(2));
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

  // ─── Cuotas: reconciliación contra el balance pagado (Sprint 12) ───
  // Recorre las cuotas en orden y marca pagadas/parciales según el monto cubierto.
  // El update de conciliación lleva skipBalanceRecalculation para no re-disparar
  // este hook (la guard del inicio lo corta).
  if (Array.isArray(doc.installments) && doc.installments.length > 0) {
    const totalUSD = Number(doc.totalUSD) || 0;
    const balanceUSD = Number(doc.balanceUSD) || 0;
    const paidSoFar = Math.max(0, Math.min(totalUSD, totalUSD - balanceUSD));

    let covered = 0;
    let changed = false;
    const reconciled = (doc.installments as Array<Record<string, unknown>>).map((inst) => {
      const amount = Number(inst.amountUSD) || 0;
      const prevPaid = Number(inst.paidUSD) || 0;
      const remainingCredit = Math.max(0, paidSoFar - covered);
      const paidUSD = Number(Math.min(amount, remainingCredit).toFixed(2));
      covered += paidUSD;

      const status =
        paidUSD >= amount - 0.005 && amount > 0
          ? 'paid'
          : paidUSD > 0.005
            ? 'partially_paid'
            : 'pending';

      if (prevPaid !== paidUSD || inst.status !== status) {
        changed = true;
      }
      return { ...inst, paidUSD, status };
    });

    if (changed) {
      await runIsolatedContext(req, () =>
        req.payload.update({
          collection: 'invoices',
          id: doc.id,
          data: { installments: reconciled as never },
          req,
          context: { ...req.context, skipBalanceRecalculation: true },
        }),
      );
    }
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
      name: 'createdBy',
      label: 'Emitida Por (Vendedor)',
      type: 'relationship',
      relationTo: 'users',
      index: true,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Usuario que emitió la factura. Base del cálculo de comisiones.',
      },
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
      admin: {
        readOnly: true,
      },
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
      name: 'installments',
      label: 'Plan de Cuotas (CxC a Crédito)',
      type: 'array',
      admin: {
        description:
          'Generado automáticamente al emitir a crédito. Los estados se reconcilian contra el balance pagado (hook transaccional); no editar manualmente.',
      },
      fields: [
        {
          name: 'number',
          label: 'Nro. Cuota',
          type: 'number',
          required: true,
        },
        {
          name: 'dueDate',
          label: 'Vencimiento',
          type: 'date',
          required: true,
        },
        {
          name: 'amountUSD',
          label: 'Monto (USD)',
          type: 'number',
          required: true,
          min: 0,
        },
        {
          name: 'paidUSD',
          label: 'Pagado (USD)',
          type: 'number',
          defaultValue: 0,
          min: 0,
          admin: {
            readOnly: true,
          },
        },
        {
          name: 'status',
          label: 'Estado',
          type: 'select',
          required: true,
          defaultValue: 'pending',
          options: [
            { label: 'Pendiente', value: 'pending' },
            { label: 'Parcial', value: 'partially_paid' },
            { label: 'Pagada', value: 'paid' },
          ],
        },
      ],
    },
    {
      name: 'notes',
      label: 'Observaciones / Términos de Entrega',
      type: 'textarea',
    },
  ],
  timestamps: true,
};
