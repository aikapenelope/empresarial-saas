import type { CollectionConfig } from 'payload';
import { recalculateSupplierBalance } from '../hooks/supplier-ledger';

export const PurchaseInvoices: CollectionConfig = {
  slug: 'purchase-invoices',
  labels: {
    singular: 'Factura de Compra',
    plural: 'Facturas de Compra (CxP)',
  },
  admin: {
    useAsTitle: 'invoiceReference',
    defaultColumns: ['invoiceReference', 'supplier', 'totalUSD', 'balanceUSD', 'dueDate', 'status'],
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
      async ({ data, req, operation }) => {
        if (!data) return data;

        // 1. Calcular subtotales de renglones si existen
        if (Array.isArray(data.items) && data.items.length > 0) {
          let calculatedTotal = 0;
          data.items = data.items.map((item: { quantity?: number; unitCostUSD?: number; subtotalUSD?: number }) => {
            const qty = Number(item.quantity) || 1;
            const cost = Number(item.unitCostUSD) || 0;
            const sub = Math.round(qty * cost * 100) / 100;
            calculatedTotal += sub;
            return {
              ...item,
              quantity: qty,
              unitCostUSD: cost,
              subtotalUSD: sub,
            };
          });
          data.totalUSD = Math.round(calculatedTotal * 100) / 100;
        }

        const rate = Number(data.exchangeRateSnapshot) || 1;
        data.exchangeRateSnapshot = rate;

        if (data.totalUSD !== undefined) {
          data.totalVES = Math.round(Number(data.totalUSD) * rate * 100) / 100;
        }

        // 2. Inicialización en creación
        if (operation === 'create') {
          data.issueDate = data.issueDate || new Date().toISOString();

          if (data.paymentType === 'cash') {
            data.balanceUSD = 0;
            data.balanceVES = 0;
            data.status = 'paid';
          } else {
            if (data.balanceUSD === undefined) {
              data.balanceUSD = data.totalUSD;
            }
            data.status = data.status || 'pending';
          }

          if (!data.dueDate && data.paymentType === 'credit' && data.supplier) {
            try {
              const supplierDoc = await req.payload.findByID({
                collection: 'suppliers',
                id: String(data.supplier),
                depth: 0,
                req,
              });
              const creditDays = supplierDoc?.creditConfig?.creditDays || 30;
              const due = new Date(data.issueDate);
              due.setDate(due.getDate() + Number(creditDays));
              data.dueDate = due.toISOString();
            } catch {
              const due = new Date(data.issueDate);
              due.setDate(due.getDate() + 30);
              data.dueDate = due.toISOString();
            }
          }
        }

        // 3. Sincronizar balanceVES y status
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
      async ({ doc, previousDoc, operation, req }) => {
        if (!doc) return;

        // Si es creación y tiene almacén asignado, dar entrada de inventario a los productos comprados
        if (operation === 'create' && doc.warehouse && Array.isArray(doc.items)) {
          const warehouseId = typeof doc.warehouse === 'object' && doc.warehouse !== null
            ? doc.warehouse.id
            : doc.warehouse;

          for (const item of doc.items) {
            const prodId = typeof item.product === 'object' && item.product !== null
              ? item.product.id
              : item.product;

            const qty = Number(item.quantity) || 0;
            const cost = Number(item.unitCostUSD) || 0;

            if (prodId && qty > 0) {
              try {
                // Registrar entrada de compra en Kardex
                await req.payload.create({
                  collection: 'stock-movements',
                  data: {
                    product: prodId,
                    warehouse: warehouseId,
                    movementType: 'purchase',
                    quantity: qty,
                    unitCostUSD: cost,
                    reference: doc.invoiceReference,
                    movementDate: doc.issueDate,
                    notes: `Entrada por Factura de Compra ${doc.invoiceReference}`,
                  },
                  req,
                });

                // Actualizar costo de reposición y costo promedio ponderado
                const prod = await req.payload.findByID({
                  collection: 'products',
                  id: String(prodId),
                  depth: 0,
                  req,
                });

                if (prod) {
                  const existingStock = Number(prod.inventory?.stockQuantity) || 0;
                  const currentAvg = Number(prod.pricing?.averageCostUSD) || cost;
                  const totalUnits = existingStock + qty;
                  const newAvg = totalUnits > 0
                    ? Math.round(((existingStock * currentAvg + qty * cost) / totalUnits) * 1000) / 1000
                    : cost;

                  await req.payload.update({
                    collection: 'products',
                    id: String(prodId),
                    data: {
                      pricing: {
                        ...prod.pricing,
                        costPriceUSD: cost,
                        averageCostUSD: newAvg,
                      },
                    },
                    req,
                    overrideAccess: true,
                  });
                }
              } catch (err) {
                req.payload.logger.error({ err }, `Error recording inventory for purchase invoice ${doc.id}`);
              }
            }
          }
        }

        // Recalcular saldo deudor del proveedor
        if (doc.supplier) {
          await recalculateSupplierBalance({ supplierId: doc.supplier, req });
        }
        if (previousDoc?.supplier && previousDoc.supplier !== doc.supplier) {
          await recalculateSupplierBalance({ supplierId: previousDoc.supplier, req });
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
      name: 'invoiceReference',
      label: 'N° Factura / Control del Proveedor',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'supplier',
      label: 'Proveedor',
      type: 'relationship',
      relationTo: 'suppliers',
      required: true,
      index: true,
    },
    {
      name: 'warehouse',
      label: 'Almacén de Recepción (Destino)',
      type: 'relationship',
      relationTo: 'warehouses',
      admin: {
        description: 'Almacén donde ingresa físicamente la mercancía o materia prima comprada.',
      },
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
      label: 'Estado de Pago',
      type: 'select',
      defaultValue: 'pending',
      options: [
        { label: 'Pendiente por Pagar', value: 'pending' },
        { label: 'Abono Parcial', value: 'partially_paid' },
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
      label: 'Fecha Límite de Pago',
      type: 'date',
      admin: {
        position: 'sidebar',
      },
    },
    // --- Campos Financieros ---
    {
      name: 'exchangeRateSnapshot',
      label: 'Tasa Cambiaria Aplicada (USD/VES)',
      type: 'number',
      required: true,
      defaultValue: 1,
    },
    {
      name: 'totalUSD',
      label: 'Total Factura de Compra (USD)',
      type: 'number',
      required: true,
      defaultValue: 0,
      index: true,
    },
    {
      name: 'totalVES',
      label: 'Total Equivalente (Bs)',
      type: 'number',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'balanceUSD',
      label: 'Saldo Pendiente por Pagar (USD)',
      type: 'number',
      defaultValue: 0,
      index: true,
    },
    {
      name: 'balanceVES',
      label: 'Saldo Pendiente Equivalente (Bs)',
      type: 'number',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'items',
      label: 'Renglones Comprados / Gastos',
      type: 'array',
      fields: [
        {
          name: 'product',
          label: 'Producto o Materia Prima (Opcional)',
          type: 'relationship',
          relationTo: 'products',
        },
        {
          name: 'sku',
          label: 'SKU / Código del Proveedor',
          type: 'text',
        },
        {
          name: 'description',
          label: 'Descripción del Bien o Insumo',
          type: 'text',
          required: true,
        },
        {
          name: 'quantity',
          label: 'Cantidad Recibida',
          type: 'number',
          required: true,
          defaultValue: 1,
        },
        {
          name: 'unitCostUSD',
          label: 'Costo Unitario (USD)',
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
      label: 'Notas de Recepción / Justificación',
      type: 'textarea',
    },
  ],
};
