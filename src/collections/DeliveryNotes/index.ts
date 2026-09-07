import type { CollectionBeforeDeleteHook, CollectionBeforeValidateHook, CollectionConfig } from 'payload';

/**
 * Remisiones / Notas de Entrega (Sprint 20). Documento logístico emitido desde
 * pedidos `confirmed` (totales o parciales por línea).
 *
 * Invariante kardex: la remisión NO genera movimientos de inventario — el
 * stock se descarga exclusivamente con la factura (plugin salesInventory).
 * `voided` es estado final inmutable; sólo se eliminan remisiones anuladas.
 */
const beforeValidateDeliveryNote: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  operation,
}) => {
  if (!data) return data;

  if (operation === 'create' && !data.status) {
    data.status = 'issued';
  }

  // Inmutabilidad de remisiones anuladas
  if (operation === 'update' && originalDoc && originalDoc.status === 'voided') {
    throw new Error('Una remisión anulada es inmutable.');
  }

  return data;
};

const beforeDeleteDeliveryNote: CollectionBeforeDeleteHook = async ({ id, req }) => {
  // beforeDelete no entrega el doc: se consulta dentro de la misma transacción.
  const doc = await req.payload.findByID({
    collection: 'delivery-notes',
    id,
    depth: 0,
    req,
  });
  if (doc && doc.status === 'issued') {
    throw new Error('Anula la remisión antes de eliminarla.');
  }
};

export const DeliveryNotes: CollectionConfig = {
  slug: 'delivery-notes',
  labels: {
    singular: 'Remisión',
    plural: 'Remisiones',
  },
  admin: {
    useAsTitle: 'noteNumber',
    group: 'Ventas',
    defaultColumns: ['noteNumber', 'order', 'status', 'totalUSD', 'createdAt'],
  },
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) =>
      Boolean(user?.role === 'super-admin' || user?.role === 'tenant-admin'),
  },
  hooks: {
    beforeValidate: [beforeValidateDeliveryNote],
    beforeDelete: [beforeDeleteDeliveryNote],
  },
  fields: [
    {
      name: 'noteNumber',
      label: 'Número de Remisión',
      type: 'text',
      required: true,
      index: true,
      admin: {
        description: 'Correlativo REM-##### generado por la Server Action (numeración con lock).',
      },
    },
    {
      name: 'order',
      label: 'Pedido Origen',
      type: 'relationship',
      relationTo: 'orders',
      required: true,
      index: true,
    },
    {
      name: 'customer',
      label: 'Cliente (snapshot)',
      type: 'relationship',
      relationTo: 'customers',
      required: true,
      index: true,
      admin: {
        description: 'Copia del cliente del pedido para trazabilidad de la remisión.',
      },
    },
    {
      name: 'items',
      label: 'Líneas Despachadas',
      type: 'array',
      required: true,
      minRows: 1,
      fields: [
        {
          name: 'orderItemIndex',
          label: 'Línea del Pedido',
          type: 'number',
          required: true,
          min: 0,
          admin: {
            description: 'Índice de la línea del pedido que este ítem despacha.',
          },
        },
        {
          name: 'product',
          label: 'Producto',
          type: 'relationship',
          relationTo: 'products',
          index: true,
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
          label: 'Cantidad Despachada',
          type: 'number',
          required: true,
          min: 0.001,
        },
        {
          name: 'unitPriceUSD',
          label: 'Precio Unitario (USD, snapshot del pedido)',
          type: 'number',
          required: true,
          min: 0,
          defaultValue: 0,
        },
        {
          name: 'discountPct',
          label: 'Descuento (%) snapshot',
          type: 'number',
          min: 0,
          max: 100,
          defaultValue: 0,
        },
      ],
    },
    {
      name: 'issueDate',
      label: 'Fecha de Emisión',
      type: 'date',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'status',
      label: 'Estado de la Remisión',
      type: 'select',
      required: true,
      defaultValue: 'issued',
      options: [
        { label: 'Emitida', value: 'issued' },
        { label: 'Anulada', value: 'voided' },
      ],
    },
    {
      name: 'exchangeRateSnapshot',
      label: 'Tasa de Cambio (heredada del pedido)',
      type: 'number',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'totalUSD',
      label: 'Valor Despachado (USD)',
      type: 'number',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'totalVES',
      label: 'Valor Despachado (VES)',
      type: 'number',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'invoice',
      label: 'Factura Asociada',
      type: 'relationship',
      relationTo: 'invoices',
      index: true,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Se llena si la mercancía despachada se facturó.',
      },
    },
    {
      name: 'notes',
      label: 'Notas de Entrega',
      type: 'textarea',
    },
    {
      // Sprint 28: token de compartición pública (envío por email / WhatsApp).
      // 32 bytes del CSPRNG; se emite perezosamente la primera vez que se
      // comparte el documento y nunca es editable por la UI ni por REST.
      name: 'shareToken',
      label: 'Token de Compartición',
      type: 'text',
      index: true,
      unique: true,
      hidden: true,
      access: {
        create: () => false,
        update: () => false,
      },
    },
  ],
  timestamps: true,
};
