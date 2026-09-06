import type { CollectionBeforeDeleteHook, CollectionBeforeValidateHook, CollectionConfig } from 'payload';

/**
 * Transiciones de estado de un pedido de venta (Sprint 19).
 * `draft → confirmed → invoiced` vía Server Actions; `canceled` es final.
 * `invoiced` y `canceled` son estados finales inmutables.
 *
 * Invariante kardex: el pedido NO genera movimientos de inventario; el stock
 * se descarga exclusivamente con la factura emitida desde él (plugin
 * salesInventory). El pedido es el eslabón comercial entre cotización y factura.
 */
const FINAL_STATUSES = new Set(['invoiced', 'canceled']);

/**
 * Máquina de estados COMPLETA, aplicada en la colección (no sólo en Server
 * Actions) para que admin panel y Local API no puedan saltarse el ciclo:
 *   draft → draft | confirmed | canceled
 *   confirmed → confirmed | invoiced (requiere issuedInvoice) | canceled
 *   invoiced / canceled: finales inmutables
 * La creación sólo admite `draft` (o vacío → default). Las Server Actions
 * operan dentro de estas transiciones legales con lock de fila.
 */
const ALLOWED_TRANSITIONS: Record<string, Set<string>> = {
  draft: new Set(['draft', 'confirmed', 'canceled']),
  confirmed: new Set(['confirmed', 'invoiced', 'canceled']),
};

const beforeValidateOrder: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  operation,
}) => {
  if (!data) return data;

  // Snapshot de tasa: lo fija la Server Action al crear (resolveEffectiveRate);
  // en updates se conserva la tasa vigente del documento.
  const rate = Number(data.exchangeRateSnapshot) || Number(originalDoc?.exchangeRateSnapshot) || 1;

  // Totales desde las líneas: qty * precio * (1 - descuento%) — el descuento
  // es opcional por línea y no modifica el precio unitario del catálogo.
  if (Array.isArray(data.items)) {
    let sumTotalUSD = 0;
    data.items = data.items.map((item) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unitPriceUSD) || 0;
      const discount = Math.min(Math.max(Number(item.discountPct) || 0, 0), 100);
      const lineTotal = Number((qty * price * (1 - discount / 100)).toFixed(2));
      sumTotalUSD += lineTotal;
      return {
        ...item,
        totalUSD: lineTotal,
      };
    });
    data.totalUSD = Number(sumTotalUSD.toFixed(2));
    data.totalVES = Number((data.totalUSD * rate).toFixed(2));
  } else if (originalDoc?.totalUSD) {
    data.totalUSD = Number(originalDoc.totalUSD);
    data.totalVES = Number((data.totalUSD * rate).toFixed(2));
  }

  if (operation === 'create') {
    if (!data.issueDate) {
      data.issueDate = new Date().toISOString();
    }
    if (!data.status) {
      data.status = 'draft';
    }
  }

  // Creación: sólo borrador (sin saltos a estados intermedios o finales)
  if (operation === 'create' && data.status && data.status !== 'draft') {
    throw new Error(
      'Un pedido nuevo sólo puede crearse en borrador; usa las acciones de confirmación, facturación o cancelación.',
    );
  }

  // Inmutabilidad de estados finales
  if (operation === 'update' && originalDoc) {
    if (FINAL_STATUSES.has(originalDoc.status)) {
      throw new Error(
        originalDoc.status === 'invoiced'
          ? 'Un pedido ya facturado es inmutable.'
          : 'Un pedido cancelado no puede cambiar de estado.',
      );
    }

    // Máquina de estados: transiciones legales desde borrador/confirmado
    const from = originalDoc.status as string;
    const to = String(data.status ?? from);
    const allowed = ALLOWED_TRANSITIONS[from];
    if (!allowed || !allowed.has(to)) {
      throw new Error(`Transición de estado inválida: "${from}" → "${to}".`);
    }

    // entradas a `confirmed` exigen su marca de tiempo
    if (from === 'draft' && to === 'confirmed') {
      const confirmedAt = data.confirmedAt ?? originalDoc.confirmedAt;
      if (!confirmedAt) {
        throw new Error('Confirmar un pedido requiere la fecha de confirmación (confirmedAt).');
      }
    }
    // entrada a `invoiced` exige la factura generada
    if (from === 'confirmed' && to === 'invoiced') {
      const issuedInvoice = data.issuedInvoice ?? originalDoc.issuedInvoice;
      if (!issuedInvoice) {
        throw new Error('Facturar un pedido requiere la relación issuedInvoice (factura generada).');
      }
    }
  }

  return data;
};

const beforeDeleteOrder: CollectionBeforeDeleteHook = async ({ id, req }) => {
  // beforeDelete no entrega el doc: se consulta dentro de la misma transacción.
  const doc = await req.payload.findByID({
    collection: 'orders',
    id,
    depth: 0,
    req,
  });
  if (doc && doc.status !== 'draft') {
    throw new Error('Sólo los pedidos en borrador pueden eliminarse; confirma o cancela el pedido.');
  }
};

export const Orders: CollectionConfig = {
  slug: 'orders',
  labels: {
    singular: 'Pedido',
    plural: 'Pedidos',
  },
  admin: {
    useAsTitle: 'orderNumber',
    group: 'Ventas',
    defaultColumns: ['orderNumber', 'customer', 'status', 'totalUSD', 'createdAt'],
  },
  access: {
    read: ({ req: { user } }) => Boolean(user),
    // Escritura sólo para roles operativos: employee (y anónimos) no pueden
    // forzar transiciones por REST; las Server Actions además revalidan RBAC.
    create: ({ req: { user } }) =>
      Boolean(
        user &&
          ['super-admin', 'tenant-admin', 'supervisor', 'vendor', 'cashier'].includes(user.role),
      ),
    update: ({ req: { user } }) =>
      Boolean(
        user &&
          ['super-admin', 'tenant-admin', 'supervisor', 'vendor', 'cashier'].includes(user.role),
      ),
    delete: ({ req: { user } }) =>
      Boolean(user?.role === 'super-admin' || user?.role === 'tenant-admin'),
  },
  hooks: {
    beforeValidate: [beforeValidateOrder],
    beforeDelete: [beforeDeleteOrder],
  },
  fields: [
    {
      name: 'orderNumber',
      label: 'Número de Pedido',
      type: 'text',
      required: true,
      index: true,
      access: {
        // Generado por la Server Action (numeración con lock): inmutable vía
        // REST/admin. Las acciones escriben con overrideAccess.
        create: () => false,
        update: () => false,
      },
      admin: {
        readOnly: true,
        description: 'Correlativo PED-##### generado por la Server Action (numeración con lock).',
      },
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
      name: 'priceTierSnapshot',
      label: 'Tier de Precio al Pedir',
      type: 'select',
      options: [
        { label: 'Retail (detal)', value: 'retail' },
        { label: 'Wholesale (mayorista)', value: 'wholesale' },
        { label: 'Vendor (vendedor)', value: 'vendor' },
        { label: 'Promo (promoción)', value: 'promo' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Segmento del cliente al momento de crear el pedido.',
      },
    },
    {
      name: 'items',
      label: 'Líneas del Pedido',
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
            description: 'Opcional: las líneas sin producto son conceptos de texto libre.',
          },
        },
        {
          name: 'sku',
          label: 'Código / SKU',
          type: 'text',
        },
        {
          name: 'description',
          label: 'Descripción',
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
          name: 'discountPct',
          label: 'Descuento (%)',
          type: 'number',
          min: 0,
          max: 100,
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
    {
      name: 'issueDate',
      label: 'Fecha del Pedido',
      type: 'date',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'confirmedAt',
      label: 'Fecha de Confirmación',
      type: 'date',
      access: {
        create: () => false,
        update: () => false,
      },
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'status',
      label: 'Estado del Pedido',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      access: {
        // Las transiciones las autorizan las Server Actions (overrideAccess) y
        // la máquina de estados del beforeValidate; por REST/admin el campo no
        // es escribible — imposible forjar confirmaciones/cancelaciones.
        create: () => false,
        update: () => false,
      },
      options: [
        { label: 'Borrador', value: 'draft' },
        { label: 'Confirmado (pendiente de despacho)', value: 'confirmed' },
        { label: 'Facturado', value: 'invoiced' },
        { label: 'Cancelado', value: 'canceled' },
      ],
    },
    {
      name: 'exchangeRateSnapshot',
      label: 'Tasa de Cambio al Emitir (USD a VES)',
      type: 'number',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'totalUSD',
      label: 'Total del Pedido (USD)',
      type: 'number',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'totalVES',
      label: 'Total del Pedido (VES)',
      type: 'number',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'issuedInvoice',
      label: 'Factura Generada',
      type: 'relationship',
      relationTo: 'invoices',
      index: true,
      access: {
        create: () => false,
        update: () => false,
      },
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Se llena automáticamente al facturar el pedido confirmado.',
      },
    },
    {
      name: 'notes',
      label: 'Notas / Instrucciones de Entrega',
      type: 'textarea',
    },
  ],
  timestamps: true,
};
