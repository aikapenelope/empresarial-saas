import type { CollectionConfig } from 'payload';
import { recalculateCustomerBalance } from '../hooks/ledger';

export const CustomerPayments: CollectionConfig = {
  slug: 'customer-payments',
  labels: {
    singular: 'Cobranza / Abono',
    plural: 'Cobranzas / Abonos de Clientes',
  },
  admin: {
    useAsTitle: 'paymentNumber',
    defaultColumns: ['paymentNumber', 'customer', 'amountUSD', 'paymentMethod', 'paymentDate', 'reference'],
    group: 'Finanzas & CRM',
  },
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => Boolean(user),
  },
  hooks: {
    beforeChange: [
      async ({ data, operation }) => {
        if (!data) return data;

        // Autogenerar folio de recibo si no existe
        if (operation === 'create' && !data.paymentNumber) {
          const timestamp = Date.now().toString().slice(-6);
          const random = Math.floor(Math.random() * 900 + 100);
          data.paymentNumber = `RC-${timestamp}-${random}`;
        }

        data.paymentDate = data.paymentDate || new Date().toISOString();
        const rate = Number(data.exchangeRateApplied) || 1;
        data.exchangeRateApplied = rate;

        if (data.amountUSD !== undefined && !data.amountVES) {
          data.amountVES = Math.round(Number(data.amountUSD) * rate * 100) / 100;
        }

        return data;
      },
    ],
    afterChange: [
      async ({ doc, req }) => {
        if (!doc) return;

        // Reconciliación atómica sobre las facturas abonadas
        if (Array.isArray(doc.allocations) && doc.allocations.length > 0) {
          for (const alloc of doc.allocations) {
            const invoiceId = typeof alloc.invoice === 'object' && alloc.invoice !== null
              ? alloc.invoice.id
              : alloc.invoice;

            const allocatedAmount = Number(alloc.allocatedAmountUSD) || 0;

            if (invoiceId && allocatedAmount > 0) {
              try {
                const inv = await req.payload.findByID({
                  collection: 'invoices',
                  id: String(invoiceId),
                  depth: 0,
                  req,
                });

                if (inv) {
                  const newBalanceUSD = Math.max(0, Math.round((Number(inv.balanceUSD || 0) - allocatedAmount) * 100) / 100);
                  const rate = Number(inv.exchangeRateSnapshot) || 1;
                  const newBalanceVES = Math.round(newBalanceUSD * rate * 100) / 100;
                  const newStatus = newBalanceUSD <= 0 ? 'paid' : 'partially_paid';

                  await req.payload.update({
                    collection: 'invoices',
                    id: String(invoiceId),
                    data: {
                      balanceUSD: newBalanceUSD,
                      balanceVES: newBalanceVES,
                      status: newStatus,
                    },
                    req,
                    overrideAccess: true,
                  });
                }
              } catch (err) {
                req.payload.logger.error({ err }, `Error reconciling invoice ${invoiceId} in payment ${doc.id}`);
              }
            }
          }
        }

        // Recalcular saldo total del cliente
        if (doc.customer) {
          await recalculateCustomerBalance({ customerId: doc.customer, req });
        }
      },
    ],
    beforeDelete: [
      async ({ id, req }) => {
        try {
          const doc = await req.payload.findByID({
            collection: 'customer-payments',
            id: String(id),
            depth: 0,
            req,
          });

          if (!doc) return;

          // Revertir balances en facturas antes de eliminar el recibo de cobro
          if (Array.isArray(doc.allocations)) {
            for (const alloc of doc.allocations) {
              const invoiceId = typeof alloc.invoice === 'object' && alloc.invoice !== null
                ? alloc.invoice.id
                : alloc.invoice;
              const allocatedAmount = Number(alloc.allocatedAmountUSD) || 0;

              if (invoiceId && allocatedAmount > 0) {
                try {
                  const inv = await req.payload.findByID({
                    collection: 'invoices',
                    id: String(invoiceId),
                    depth: 0,
                    req,
                  });

                  if (inv) {
                    const total = Number(inv.totalUSD || 0);
                    const currentBal = Number(inv.balanceUSD || 0);
                    const revertedBalanceUSD = Math.min(total, Math.round((currentBal + allocatedAmount) * 100) / 100);
                    const rate = Number(inv.exchangeRateSnapshot) || 1;
                    const revertedBalanceVES = Math.round(revertedBalanceUSD * rate * 100) / 100;
                    const revertedStatus = revertedBalanceUSD >= total ? 'pending' : 'partially_paid';

                    await req.payload.update({
                      collection: 'invoices',
                      id: String(invoiceId),
                      data: {
                        balanceUSD: revertedBalanceUSD,
                        balanceVES: revertedBalanceVES,
                        status: revertedStatus,
                      },
                      req,
                      overrideAccess: true,
                    });
                  }
                } catch (err) {
                  req.payload.logger.error({ err }, `Error reverting invoice ${invoiceId}`);
                }
              }
            }
          }
        } catch (err) {
          req.payload.logger.error({ err }, `Error finding payment before delete ${id}`);
        }
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        if (doc?.customer) {
          await recalculateCustomerBalance({ customerId: doc.customer, req });
        }
      },
    ],
  },
  fields: [
    {
      name: 'paymentNumber',
      label: 'N° Recibo de Cobro',
      type: 'text',
      required: true,
      unique: true,
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
      label: 'Fecha del Abono',
      type: 'date',
      required: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'paymentMethod',
      label: 'Método de Pago',
      type: 'select',
      required: true,
      defaultValue: 'pago_movil',
      options: [
        { label: 'Pago Móvil (Bs)', value: 'pago_movil' },
        { label: 'Transferencia Bancaria (Bs)', value: 'transfer_ves' },
        { label: 'Efectivo Dólares ($)', value: 'cash_usd' },
        { label: 'Efectivo Bolívares (Bs)', value: 'cash_ves' },
        { label: 'Zelle ($)', value: 'zelle' },
        { label: 'Binance P2P / USDT', value: 'binance' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'amountUSD',
      label: 'Monto Recibido (USD)',
      type: 'number',
      required: true,
      defaultValue: 0,
      index: true,
    },
    {
      name: 'exchangeRateApplied',
      label: 'Tasa Aplicada (USD/VES)',
      type: 'number',
      required: true,
      defaultValue: 1,
    },
    {
      name: 'amountVES',
      label: 'Monto Recibido Equivalente (Bs)',
      type: 'number',
    },
    {
      name: 'reference',
      label: 'Referencia Bancaria / Confirmación',
      type: 'text',
      index: true,
    },
    {
      name: 'allocations',
      label: 'Asignación de Pago a Facturas',
      type: 'array',
      fields: [
        {
          name: 'invoice',
          label: 'Factura / Nota de Entrega',
          type: 'relationship',
          relationTo: 'invoices',
          required: true,
        },
        {
          name: 'allocatedAmountUSD',
          label: 'Monto Abonado a esta Factura (USD)',
          type: 'number',
          required: true,
          defaultValue: 0,
        },
      ],
    },
    {
      name: 'notes',
      label: 'Observaciones de Cobranza',
      type: 'textarea',
    },
  ],
};
