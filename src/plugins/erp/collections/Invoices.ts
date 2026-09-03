import type { CollectionConfig } from 'payload';
import { recalculateCustomerBalance } from '../hooks/ledger';

export const Invoices: CollectionConfig = {
  slug: 'invoices',
  labels: {
    singular: 'Factura / Nota de Entrega',
    plural: 'Facturas / Cuentas por Cobrar',
  },
  admin: {
    useAsTitle: 'invoiceNumber',
    defaultColumns: ['invoiceNumber', 'customer', 'totalUSD', 'balanceUSD', 'dueDate', 'status'],
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
      async ({ data, req, operation }) => {
        if (!data) return data;

        // 1. Calcular subtotales y totalUSD si hay renglones
        if (Array.isArray(data.items) && data.items.length > 0) {
          let calculatedTotal = 0;
          data.items = data.items.map((item: { quantity?: number; unitPriceUSD?: number; subtotalUSD?: number }) => {
            const qty = Number(item.quantity) || 1;
            const price = Number(item.unitPriceUSD) || 0;
            const sub = Math.round(qty * price * 100) / 100;
            calculatedTotal += sub;
            return {
              ...item,
              quantity: qty,
              unitPriceUSD: price,
              subtotalUSD: sub,
            };
          });
          data.totalUSD = Math.round(calculatedTotal * 100) / 100;
        }

        const rate = Number(data.exchangeRateSnapshot) || 1;
        data.exchangeRateSnapshot = rate;

        // 2. Multi-moneda: calcular totalVES
        if (data.totalUSD !== undefined) {
          data.totalVES = Math.round(Number(data.totalUSD) * rate * 100) / 100;
        }

        // 3. Inicialización en creación
        if (operation === 'create') {
          data.issueDate = data.issueDate || new Date().toISOString();

          // Si es venta de contado, nace pagada
          if (data.paymentType === 'cash') {
            data.balanceUSD = 0;
            data.balanceVES = 0;
            data.status = 'paid';
          } else {
            // Venta a crédito: saldo inicial = totalUSD
            if (data.balanceUSD === undefined) {
              data.balanceUSD = data.totalUSD;
            }
            data.status = data.status || 'pending';
          }

          // Si no se proveyó dueDate, calcular según creditDays del cliente
          if (!data.dueDate && data.paymentType === 'credit' && data.customer) {
            try {
              const customerDoc = await req.payload.findByID({
                collection: 'customers',
                id: String(data.customer),
                depth: 0,
                req,
              });
              const creditDays = customerDoc?.creditConfig?.creditDays || 15;
              const due = new Date(data.issueDate);
              due.setDate(due.getDate() + Number(creditDays));
              data.dueDate = due.toISOString();
            } catch {
              const due = new Date(data.issueDate);
              due.setDate(due.getDate() + 15);
              data.dueDate = due.toISOString();
            }
          }
        }

        // 4. Mantener balanceVES en sync con balanceUSD
        if (data.balanceUSD !== undefined) {
          data.balanceVES = Math.round(Number(data.balanceUSD) * rate * 100) / 100;
          if (Number(data.balanceUSD) <= 0 && data.status !== 'cancelled') {
            data.status = 'paid';
          } else if (Number(data.balanceUSD) < Number(data.totalUSD) && Number(data.balanceUSD) > 0) {
            data.status = 'partially_paid';
          }
        }

        return data;
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, req }) => {
        if (doc?.customer) {
          await recalculateCustomerBalance({ customerId: doc.customer, req });
        }
        if (previousDoc?.customer && previousDoc.customer !== doc?.customer) {
          await recalculateCustomerBalance({ customerId: previousDoc.customer, req });
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
      name: 'invoiceNumber',
      label: 'Número de Factura / Control',
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
      name: 'paymentType',
      label: 'Condición de Pago',
      type: 'select',
      defaultValue: 'credit',
      options: [
        { label: 'Crédito', value: 'credit' },
        { label: 'Contado', value: 'cash' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'status',
      label: 'Estado de la Factura',
      type: 'select',
      defaultValue: 'pending',
      options: [
        { label: 'Borrador', value: 'draft' },
        { label: 'Pendiente por Cobrar', value: 'pending' },
        { label: 'Abonada / Pago Parcial', value: 'partially_paid' },
        { label: 'Pagada Totalmente', value: 'paid' },
        { label: 'Anulada', value: 'cancelled' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'issueDate',
      label: 'Fecha de Emisión',
      type: 'date',
      required: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'dueDate',
      label: 'Fecha de Vencimiento',
      type: 'date',
      admin: {
        position: 'sidebar',
      },
    },
    // --- Campos Financieros Top-Level para Indexación y Ordenamiento Directo ---
    {
      name: 'exchangeRateSnapshot',
      label: 'Tasa de Cambio Fijada (USD/VES)',
      type: 'number',
      required: true,
      defaultValue: 1,
    },
    {
      name: 'totalUSD',
      label: 'Monto Total Factura (USD)',
      type: 'number',
      required: true,
      defaultValue: 0,
      index: true,
    },
    {
      name: 'totalVES',
      label: 'Monto Total Equivalente (Bs / Local)',
      type: 'number',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'balanceUSD',
      label: 'Saldo Pendiente por Cobrar (USD)',
      type: 'number',
      defaultValue: 0,
      index: true,
    },
    {
      name: 'balanceVES',
      label: 'Saldo Pendiente Equivalente (Bs / Local)',
      type: 'number',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'items',
      label: 'Renglones Facturados',
      type: 'array',
      fields: [
        {
          name: 'sku',
          label: 'SKU / Código',
          type: 'text',
        },
        {
          name: 'description',
          label: 'Descripción del Producto / Servicio',
          type: 'text',
          required: true,
        },
        {
          name: 'quantity',
          label: 'Cantidad',
          type: 'number',
          required: true,
          defaultValue: 1,
        },
        {
          name: 'unitPriceUSD',
          label: 'Precio Unitario (USD)',
          type: 'number',
          required: true,
          defaultValue: 0,
        },
        {
          name: 'subtotalUSD',
          label: 'Subtotal (USD)',
          type: 'number',
          admin: {
            readOnly: true,
          },
        },
      ],
    },
    {
      name: 'notes',
      label: 'Observaciones / Términos',
      type: 'textarea',
    },
  ],
};
