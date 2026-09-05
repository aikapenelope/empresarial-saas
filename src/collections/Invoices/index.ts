import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeDeleteHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
} from 'payload';
import { sql } from '@payloadcms/db-postgres';
import {
  extractId,
  getInvoicePaidAmount,
  recalculateCustomerBalance,
} from '../../utilities/financeLedger';
import { getActiveDb } from '../../utilities/inventoryLedger';
import {
  applySaleStockDeduction,
  revertSaleFromInventory,
} from '../../utilities/salesLedger';

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

  // ─── Kardex: publicación y reversión de inventario (Sprint 7) ───
  // Compuesto con el recálculo de balances; la idempotencia estructural del
  // salesLedger (lock FOR UPDATE + consulta de movimientos existentes) evita
  // dobles descargas en updates que re-disparan este hook.
  const previousStatus = previousDoc?.status;
  const currentStatus = doc.status;

  if (previousStatus !== 'voided' && currentStatus === 'voided') {
    await revertSaleFromInventory(doc.id, req);
  } else if (
    previousStatus === 'voided' &&
    currentStatus !== 'voided'
  ) {
    await applySaleStockDeduction(doc.id, req);
  } else if (!previousStatus && currentStatus !== 'voided' && currentStatus !== 'draft') {
    await applySaleStockDeduction(doc.id, req);
  }

  return doc;
};

const beforeDeleteInvoice: CollectionBeforeDeleteHook = async ({ id, req }) => {
  // El Kardex es inmutable y referencia la factura: si ya hay descargas publicadas,
  // la factura NO puede eliminarse (rompería el ledger). La vía correcta es anular
  // (status voided), lo que revierte el inventario con movimientos `sale_return`.
  const db = getActiveDb(req);
  const movementsRes = await db.execute(
    sql`SELECT id FROM stock_movements WHERE invoice_id = ${id} LIMIT 1`,
  );
  if (movementsRes.rows && movementsRes.rows.length > 0) {
    throw new Error(
      'No se puede eliminar una factura con movimientos de inventario publicados (Kardex inmutable). Anúlela con status "voided" para revertir el inventario.',
    );
  }
  return true;
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
    beforeDelete: [beforeDeleteInvoice],
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
      name: 'warehouse',
      label: 'Almacén de Despacho (Salida de Inventario)',
      type: 'relationship',
      relationTo: 'warehouses',
      index: true,
      admin: {
        description:
          'De dónde sale el inventario de esta factura. Si se omite, se usa el almacén por defecto del inquilino. Solo se aplica al publicar la descarga (Kardex inmutable).',
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
          name: 'product',
          label: 'Producto de Catálogo',
          type: 'relationship',
          relationTo: 'products',
          index: true,
          admin: {
            description:
              'Vínculo al catálogo. Las líneas con producto descargan inventario al publicarse (Kardex); las de texto libre sin producto no afectan existencias.',
          },
        },
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
      name: 'notes',
      label: 'Observaciones / Términos de Entrega',
      type: 'textarea',
    },
  ],
  timestamps: true,
};
