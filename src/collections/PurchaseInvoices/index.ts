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
  getActiveDb,
  getPurchaseInvoicePaidAmount,
  getUserTenantIds,
  postPurchaseReceptionMovements,
  recalculateSupplierBalance,
} from '../../utilities/purchasesLedger';

const beforeValidatePurchaseInvoice: CollectionBeforeValidateHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (!data) return data;

  const rate =
    Number(data.exchangeRateSnapshot) || Number(originalDoc?.exchangeRateSnapshot) || 1;

  // 1. Partial update item merging & line total calculations
  if (Array.isArray(data.items)) {
    let sumTotalUSD = 0;
    data.items = data.items.map((item) => {
      const qty = Number(item.quantity) || 0;
      const cost = Number(item.unitCostUSD) || 0;
      const lineTotal = Number((qty * cost).toFixed(2));
      sumTotalUSD += lineTotal;
      return {
        ...item,
        totalUSD: lineTotal,
      };
    });

    data.totalUSD = Number(sumTotalUSD.toFixed(2));
    data.totalVES = Number((data.totalUSD * rate).toFixed(2));
  } else if (originalDoc?.items && Array.isArray(originalDoc.items)) {
    // Preserve existing items on partial update
    data.totalUSD = Number(originalDoc.totalUSD) || 0;
    data.totalVES = Number((data.totalUSD * rate).toFixed(2));
  }

  // 2. Multi-tenant and relation integrity
  const supplierId = extractId(data.supplier) || extractId(originalDoc?.supplier);
  if (!supplierId && operation === 'create') {
    throw new Error('Debe especificar un proveedor válido para la factura de compra.');
  }

  if (supplierId) {
    const supplier = await req.payload.findByID({
      collection: 'suppliers',
      id: supplierId,
      depth: 0,
      req,
    });

    if (!supplier) {
      throw new Error(`El proveedor con ID ${supplierId} no existe.`);
    }

    const supplierTenant = extractId(supplier.tenant);
    if (supplierTenant) {
      if (!data.tenant && !originalDoc?.tenant) {
        data.tenant = supplierTenant as number;
      } else {
        const effectiveTenant = extractId(data.tenant) || extractId(originalDoc?.tenant);
        if (effectiveTenant && String(effectiveTenant) !== String(supplierTenant)) {
          throw new Error('Violación de multi-inquilino: El proveedor pertenece a otro inquilino.');
        }
      }
    }
  }

  const effectiveTenantId = extractId(data.tenant) || extractId(originalDoc?.tenant);

  // Enforce tenant permission for non-super-admins
  if (req.user && req.user.role !== 'super-admin' && effectiveTenantId) {
    const userTenants = getUserTenantIds(req.user);
    if (!userTenants.map(String).includes(String(effectiveTenantId))) {
      throw new Error('Prohibido: No tiene acceso a este inquilino.');
    }
  }

  // Reception warehouse tenant check
  const warehouseId =
    extractId(data.receptionWarehouse) || extractId(originalDoc?.receptionWarehouse);
  if (warehouseId) {
    const warehouse = await req.payload.findByID({
      collection: 'warehouses',
      id: warehouseId,
      depth: 0,
      req,
    });
    const whTenant = extractId(warehouse?.tenant);
    if (whTenant && effectiveTenantId && String(whTenant) !== String(effectiveTenantId)) {
      throw new Error(
        'Violación de multi-inquilino: El almacén de recepción pertenece a otro inquilino.',
      );
    }
  }

  // Verify product tenant consistency across lines
  const itemsToCheck = Array.isArray(data.items)
    ? data.items
    : Array.isArray(originalDoc?.items)
      ? originalDoc.items
      : [];

  for (const item of itemsToCheck) {
    const pid = extractId(item.product);
    if (pid) {
      const prod = await req.payload.findByID({
        collection: 'products',
        id: pid,
        depth: 0,
        req,
      });
      const prodTenant = extractId(prod?.tenant);
      if (prodTenant && effectiveTenantId && String(prodTenant) !== String(effectiveTenantId)) {
        throw new Error(
          `Violación de multi-inquilino: El producto ID ${pid} pertenece a otro inquilino.`,
        );
      }
    }
  }

  // 3. Reception immutability protection
  const origReceptionStatus = originalDoc?.receptionStatus as string;
  const requestedReceptionStatus = (data.receptionStatus || origReceptionStatus) as string;

  if (origReceptionStatus === 'received') {
    if (requestedReceptionStatus !== 'received') {
      throw new Error(
        'No se puede revertir la recepción de una factura de compra ya ingresada al inventario.',
      );
    }
    if (
      data.receptionWarehouse !== undefined &&
      extractId(data.receptionWarehouse) !== extractId(originalDoc.receptionWarehouse)
    ) {
      throw new Error(
        'No se puede cambiar el almacén de recepción una vez ingresada la mercancía.',
      );
    }
    if (data.items !== undefined) {
      const origItemCount = Array.isArray(originalDoc.items) ? originalDoc.items.length : 0;
      if (data.items.length !== origItemCount) {
        throw new Error(
          'No se pueden agregar o remover líneas de una factura de compra ya recepcionada.',
        );
      }
    }
  }

  if (requestedReceptionStatus === 'received') {
    if (!warehouseId) {
      throw new Error(
        'Debe especificar un almacén de recepción para recepcionar la mercancía comprada.',
      );
    }
    if (!data.receptionDate && !originalDoc?.receptionDate) {
      data.receptionDate = new Date().toISOString();
    }
  }

  // 4. Financial status and balance reconciliation
  const currentTotalUSD =
    data.totalUSD !== undefined
      ? Number(data.totalUSD)
      : Number(originalDoc?.totalUSD) || 0;

  if (operation === 'create') {
    if (data.status === 'paid' || data.status === 'voided') {
      data.balanceUSD = 0;
      data.balanceVES = 0;
    } else {
      const initialTotal = currentTotalUSD;
      data.balanceUSD =
        data.balanceUSD !== undefined && data.balanceUSD !== null
          ? Math.min(initialTotal, Number(Number(data.balanceUSD).toFixed(2)))
          : initialTotal;
      data.balanceVES = Number((data.balanceUSD * rate).toFixed(2));
    }
    return data;
  }

  // Update operation
  if (operation === 'update' && originalDoc) {
    const origTotalUSD = Number(originalDoc.totalUSD) || 0;
    const originalStatus = originalDoc.status as string;
    const requestedStatus = (data.status || originalStatus) as string;

    if (requestedStatus === 'voided') {
      if (originalStatus !== 'voided') {
        const actualPaid = await getPurchaseInvoicePaidAmount(originalDoc.id, req);
        if (actualPaid > 0) {
          throw new Error(
            'No se puede anular una factura de compra con pagos aplicados. Debe reversar o anular los egresos primero.',
          );
        }
        if (origReceptionStatus === 'received') {
          throw new Error(
            'No se puede anular una factura de compra cuya mercancía ya fue recepcionada en el inventario.',
          );
        }
      }
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

    // Un-voiding a previously voided invoice
    if (originalStatus === 'voided' && requestedStatus !== 'voided') {
      const actualPaidUSD = await getPurchaseInvoicePaidAmount(originalDoc.id, req);
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
              : 'received';
      return data;
    }

    // Reopening a previously paid invoice to received or draft
    if (
      originalStatus === 'paid' &&
      (requestedStatus === 'received' || requestedStatus === 'draft')
    ) {
      const actualPaidUSD = await getPurchaseInvoicePaidAmount(originalDoc.id, req);
      const restoredBalUSD = Math.max(0, Number((currentTotalUSD - actualPaidUSD).toFixed(2)));
      data.balanceUSD =
        data.balanceUSD !== undefined && Number(data.balanceUSD) > 0
          ? Math.min(restoredBalUSD, Number(Number(data.balanceUSD).toFixed(2)))
          : restoredBalUSD;
      data.balanceVES = Number((data.balanceUSD * rate).toFixed(2));
      data.status = requestedStatus;
      return data;
    }

    // Historical amount paid toward this invoice
    const priorPaidUSD = Math.max(
      0,
      Number((origTotalUSD - (Number(originalDoc.balanceUSD) || 0)).toFixed(2)),
    );

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
        data.status = requestedStatus === 'draft' ? 'draft' : 'received';
      }
      return data;
    }

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

const afterChangePurchaseInvoice: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
}) => {
  // If transition to receptionStatus === 'received', post atomic stock movements
  if (doc.receptionStatus === 'received' && previousDoc?.receptionStatus !== 'received') {
    await postPurchaseReceptionMovements(doc.id, req);
  }

  if (req.context?.skipBalanceRecalculation) return doc;

  const currentSupplierId = extractId(doc.supplier);
  if (currentSupplierId) {
    await recalculateSupplierBalance(currentSupplierId, req);
  }

  const previousSupplierId = extractId(previousDoc?.supplier);
  if (previousSupplierId && previousSupplierId !== currentSupplierId) {
    await recalculateSupplierBalance(previousSupplierId, req);
  }

  return doc;
};

const beforeDeletePurchaseInvoice: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const db = getActiveDb(req);

  // 1. Block deletion if stock movements exist
  const movCheck = await db.execute(
    sql`SELECT id FROM stock_movements WHERE purchase_invoice_id = ${id} LIMIT 1`,
  );
  if (movCheck.rows && movCheck.rows.length > 0) {
    throw new Error(
      'No se puede eliminar una factura de compra que ya generó movimientos de inventario en almacén.',
    );
  }

  // 2. Block deletion if receptionStatus is received
  const invCheck = await db.execute(
    sql`SELECT reception_status FROM purchase_invoices WHERE id = ${id} LIMIT 1`,
  );
  if (invCheck.rows?.[0]?.reception_status === 'received') {
    throw new Error(
      'No se puede eliminar una factura de compra con estatus recepcionado en inventario.',
    );
  }

  // 3. Block deletion if supplier payment allocations exist
  const payCheck = await db.execute(
    sql`SELECT _parent_id FROM supplier_payments_allocations WHERE purchase_invoice_id = ${id} LIMIT 1`,
  );
  if (payCheck.rows && payCheck.rows.length > 0) {
    throw new Error(
      'No se puede eliminar una factura de compra que tiene pagos o egresos asociados.',
    );
  }
};

const afterDeletePurchaseInvoice: CollectionAfterDeleteHook = async ({ doc, req }) => {
  if (req.context?.skipBalanceRecalculation) return doc;

  const supplierId = extractId(doc?.supplier);
  if (supplierId) {
    await recalculateSupplierBalance(supplierId, req);
  }

  return doc;
};

export const PurchaseInvoices: CollectionConfig = {
  slug: 'purchase-invoices',
  labels: {
    singular: 'Factura de Compra / CxP',
    plural: 'Facturas de Compra / CxP',
  },
  admin: {
    useAsTitle: 'invoiceNumber',
    group: 'Proveedores & CxP',
    defaultColumns: [
      'invoiceNumber',
      'supplier',
      'status',
      'receptionStatus',
      'totalUSD',
      'balanceUSD',
      'dueDate',
    ],
  },
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) =>
      Boolean(
        user?.role === 'super-admin' ||
          user?.role === 'tenant-admin' ||
          user?.role === 'supervisor',
      ),
    update: ({ req: { user } }) =>
      Boolean(
        user?.role === 'super-admin' ||
          user?.role === 'tenant-admin' ||
          user?.role === 'supervisor',
      ),
    delete: ({ req: { user } }) => {
      if (user?.role !== 'super-admin' && user?.role !== 'tenant-admin') {
        return false;
      }
      return {
        status: {
          in: ['draft', 'voided'],
        },
        receptionStatus: {
          equals: 'pending',
        },
      };
    },
  },
  hooks: {
    beforeValidate: [beforeValidatePurchaseInvoice],
    afterChange: [afterChangePurchaseInvoice],
    beforeDelete: [beforeDeletePurchaseInvoice],
    afterDelete: [afterDeletePurchaseInvoice],
  },
  fields: [
    {
      name: 'invoiceNumber',
      label: 'Número de Factura del Proveedor / Control',
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
      name: 'issueDate',
      label: 'Fecha de Emisión de la Factura',
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
      label: 'Fecha de Vencimiento de Pago',
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
      label: 'Condición de Compra',
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
      label: 'Estado de Pago / Factura',
      type: 'select',
      required: true,
      defaultValue: 'received',
      options: [
        { label: 'Borrador', value: 'draft' },
        { label: 'Recibida / Pendiente de Pago', value: 'received' },
        { label: 'Abonada Parcialmente', value: 'partially_paid' },
        { label: 'Pagada Totalmente', value: 'paid' },
        { label: 'Anulada / Sin Efecto', value: 'voided' },
      ],
    },
    {
      name: 'receptionStatus',
      label: 'Estado de Recepción de Mercancía',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      options: [
        { label: 'Pendiente por Recepcionar', value: 'pending' },
        { label: 'Mercancía Recibida en Almacén', value: 'received' },
      ],
    },
    {
      name: 'receptionWarehouse',
      label: 'Almacén Destino de Recepción',
      type: 'relationship',
      relationTo: 'warehouses',
      index: true,
      admin: {
        description:
          'Obligatorio si la compra incluye productos físicos que ingresarán a inventario.',
      },
    },
    {
      name: 'receptionDate',
      label: 'Fecha de Recepción en Almacén',
      type: 'date',
      admin: {
        readOnly: true,
        date: {
          pickerAppearance: 'dayOnly',
        },
      },
    },
    {
      name: 'exchangeRateSnapshot',
      label: 'Tasa de Cambio al Recibir (USD a VES)',
      type: 'number',
      required: true,
      defaultValue: 1,
      min: 0.0001,
    },
    {
      name: 'items',
      label: 'Líneas de Detalle / Insumos, Productos o Servicios',
      type: 'array',
      required: true,
      minRows: 1,
      fields: [
        {
          name: 'product',
          label: 'Producto / Insumo de Catálogo (Opcional si es servicio/flete)',
          type: 'relationship',
          relationTo: 'products',
        },
        {
          name: 'sku',
          label: 'Código / SKU Proveedor',
          type: 'text',
        },
        {
          name: 'description',
          label: 'Descripción del Insumo, Producto o Gasto',
          type: 'text',
          required: true,
        },
        {
          name: 'quantity',
          label: 'Cantidad',
          type: 'number',
          required: true,
          min: 0.0001,
          defaultValue: 1,
        },
        {
          name: 'unitCostUSD',
          label: 'Costo Unitario (USD)',
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
      label: 'Observaciones / Términos de Recepción',
      type: 'textarea',
    },
  ],
  timestamps: true,
};
