import type { CollectionConfig } from 'payload';
import { recalculateSupplierBalance } from '../hooks/supplier-ledger';

export const SupplierPayments: CollectionConfig = {
  slug: 'supplier-payments',
  labels: {
    singular: 'Pago a Proveedor',
    plural: 'Pagos a Proveedores (Egresos)',
  },
  admin: {
    useAsTitle: 'paymentNumber',
    defaultColumns: ['paymentNumber', 'supplier', 'amountUSD', 'paymentMethod', 'paymentDate', 'reference'],
    group: 'Proveedores & CxP',
  },
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => Boolean(user?.role === 'super-admin'),
  },
  hooks: {
    beforeChange: [
      async ({ data, operation }) => {
        if (!data) return data;

        if (operation === 'create' && !data.paymentNumber) {
          const timestamp = Date.now().toString().slice(-6);
          const random = Math.floor(Math.random() * 900 + 100);
          data.paymentNumber = `CE-${timestamp}-${random}`;
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

        // Amortización atómica sobre las facturas de compra asociadas
        if (Array.isArray(doc.allocations) && doc.allocations.length > 0) {
          for (const alloc of doc.allocations) {
            const invoiceId = typeof alloc.purchaseInvoice === 'object' && alloc.purchaseInvoice !== null
              ? alloc.purchaseInvoice.id
              : alloc.purchaseInvoice;

            const allocatedAmount = Number(alloc.allocatedAmountUSD) || 0;

            if (invoiceId && allocatedAmount > 0) {
              try {
                const inv = await req.payload.findByID({
                  collection: 'purchase-invoices',
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
                    collection: 'purchase-invoices',
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
                req.payload.logger.error({ err }, `Error reconciling purchase invoice ${invoiceId} in supplier payment ${doc.id}`);
              }
            }
          }
        }

        // Recalcular saldo total del proveedor
        if (doc.supplier) {
          await recalculateSupplierBalance({ supplierId: doc.supplier, req });
        }
      },
    ],
    beforeDelete: [
      async ({ id, req }) => {
        try {
          const doc = await req.payload.findByID({
            collection: 'supplier-payments',
            id: String(id),
            depth: 0,
            req,
          });

          if (!doc) return;

          // Revertir balances en facturas de compra
          if (Array.isArray(doc.allocations)) {
            for (const alloc of doc.allocations) {
              const invoiceId = typeof alloc.purchaseInvoice === 'object' && alloc.purchaseInvoice !== null
                ? alloc.purchaseInvoice.id
                : alloc.purchaseInvoice;
              const allocatedAmount = Number(alloc.allocatedAmountUSD) || 0;

              if (invoiceId && allocatedAmount > 0) {
                try {
                  const inv = await req.payload.findByID({
                    collection: 'purchase-invoices',
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
                      collection: 'purchase-invoices',
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
                  req.payload.logger.error({ err }, `Error reverting purchase invoice ${invoiceId}`);
                }
              }
            }
          }
        } catch (err) {
          req.payload.logger.error({ err }, `Error finding supplier payment before delete ${id}`);
        }
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        if (doc?.supplier) {
          await recalculateSupplierBalance({ supplierId: doc.supplier, req });
        }
      },
    ],
  },
  fields: [
    {
      name: 'paymentNumber',
      label: 'N° Comprobante de Egreso',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'supplier',
      label: 'Proveedor Beneficiario',
      type: 'relationship',
      relationTo: 'suppliers',
      required: true,
      index: true,
    },
    {
      name: 'paymentDate',
      label: 'Fecha del Pago',
      type: 'date',
      required: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'paymentMethod',
      label: 'Vía de Egreso / Pago',
      type: 'select',
      required: true,
      defaultValue: 'transfer_ves',
      options: [
        { label: 'Transferencia Bancaria (Bs)', value: 'transfer_ves' },
        { label: 'Pago Móvil (Bs)', value: 'pago_movil' },
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
      label: 'Monto Pagado (USD)',
      type: 'number',
      required: true,
      defaultValue: 0,
      index: true,
    },
    {
      name: 'exchangeRateApplied',
      label: 'Tasa de Cambio Aplicada (USD/VES)',
      type: 'number',
      required: true,
      defaultValue: 1,
    },
    {
      name: 'amountVES',
      label: 'Monto Pagado Equivalente (Bs)',
      type: 'number',
    },
    {
      name: 'bankOrigin',
      label: 'Banco / Cuenta de Origen de la Empresa',
      type: 'text',
    },
    {
      name: 'reference',
      label: 'N° Referencia Bancaria / Confirmación',
      type: 'text',
      index: true,
    },
    {
      name: 'allocations',
      label: 'Asignación de Pago a Facturas de Compra',
      type: 'array',
      fields: [
        {
          name: 'purchaseInvoice',
          label: 'Factura de Compra Abonada',
          type: 'relationship',
          relationTo: 'purchase-invoices',
          required: true,
        },
        {
          name: 'allocatedAmountUSD',
          label: 'Monto Aplicado a esta Factura (USD)',
          type: 'number',
          required: true,
          defaultValue: 0,
        },
      ],
    },
    {
      name: 'notes',
      label: 'Observaciones del Pago / Justificante',
      type: 'textarea',
    },
  ],
};
