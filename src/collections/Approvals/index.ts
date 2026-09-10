import type { CollectionConfig } from 'payload';

/**
 * ─── Aprobaciones con firma (IE-PR6) ─────────────────────────────────────────
 *
 * v1: un solo tipo (`credit_over_limit`) — la venta a crédito que excede el
 * límite no se rechaza: queda como solicitud PENDIENTE con el input parseado
 * completo, y un tenant-admin/supervisor la aprueba (re-ejecución con
 * revalidación natural de stock/precios/kardex) o la rechaza con nota.
 *
 * Ciclo de estado: pending → approved → consumed | rejected | expired.
 * Single-use atómico: el consumo vive en `src/utilities/approvals.ts`
 * (advisory lock + relectura dentro de la transacción de la venta).
 *
 * Las filas las escriben EXCLUSIVAMENTE las Server Actions (RBAC propio con
 * `requireErpTenantAccess` + roles), así que la colección cierra el acceso
 * directo de escritura (patrón `price-history`); la lectura exige sesión y el
 * scoping por inquilino lo inyecta multiTenantPlugin.
 */
export const Approvals: CollectionConfig = {
  slug: 'approvals',
  labels: {
    singular: 'Aprobación',
    plural: 'Aprobaciones',
  },
  admin: {
    useAsTitle: 'id',
    group: 'Administración',
    defaultColumns: ['type', 'status', 'requestedBy', 'resolvedBy', 'createdAt'],
    description:
      'Solicitudes de autorización (venta a crédito sobre el límite). Se crean desde el punto de venta y se resuelven aquí.',
  },
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: () => false,
    update: () => false,
    delete: ({ req: { user } }) =>
      Boolean(user?.role === 'super-admin' || user?.role === 'tenant-admin'),
  },
  indexes: [{ fields: ['tenant', 'status'] }],
  fields: [
    {
      name: 'type',
      label: 'Tipo de Solicitud',
      type: 'select',
      required: true,
      defaultValue: 'credit_over_limit',
      index: true,
      options: [
        { label: 'Venta a Crédito sobre el Límite', value: 'credit_over_limit' },
      ],
    },
    {
      name: 'status',
      label: 'Estado',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      options: [
        { label: 'Pendiente', value: 'pending' },
        { label: 'Aprobada', value: 'approved' },
        { label: 'Consumida', value: 'consumed' },
        { label: 'Rechazada', value: 'rejected' },
        { label: 'Expirada', value: 'expired' },
      ],
    },
    {
      name: 'requestedBy',
      label: 'Solicitada Por',
      type: 'relationship',
      relationTo: 'users',
      required: true,
    },
    {
      name: 'resolvedBy',
      label: 'Resuelta Por',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        description: 'Quien aprobó o rechazó la solicitud.',
      },
    },
    {
      name: 'decisionNote',
      label: 'Nota de Decisión',
      type: 'textarea',
      admin: {
        description: 'Obligatoria al rechazar; opcional al aprobar.',
      },
    },
    {
      name: 'refCollection',
      label: 'Colección de Referencia',
      type: 'text',
      defaultValue: 'customers',
      admin: {
        description: 'Patrón alerts: a qué apunta la solicitud (customers para crédito).',
      },
    },
    {
      name: 'refId',
      label: 'ID de Referencia',
      type: 'number',
      index: true,
      admin: {
        description: 'ID del cliente cuya línea de crédito se excedería.',
      },
    },
    {
      name: 'payload',
      label: 'Input de la Operación',
      type: 'json',
      required: true,
      admin: {
        description:
          'Input parseado completo de la venta (createInvoiceSchema) para re-ejecutarla con revalidación al aprobar.',
      },
    },
    {
      name: 'expiresAt',
      label: 'Expira En',
      type: 'date',
      required: true,
      admin: {
        description: '+24 h desde la solicitud; vencida no es consumible (debe solicitarse de nuevo).',
      },
    },
  ],
  timestamps: true,
};
