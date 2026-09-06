import type { CollectionConfig, FieldHook, PayloadRequest } from 'payload';
import {
  computeLiveCustomerOverdueDebt,
  extractId,
  fetchAllCustomerOpenInvoices,
} from '../../utilities/financeLedger';

async function getCustomerAging(
  customerIdRaw: unknown,
  req: PayloadRequest,
): Promise<{ aging0to30: number; aging31to60: number; aging60Plus: number }> {
  const customerId = extractId(customerIdRaw);
  if (!customerId) {
    return { aging0to30: 0, aging31to60: 0, aging60Plus: 0 };
  }

  const cacheKey = `customer_aging_${customerId}`;
  if (req.context?.[cacheKey]) {
    return req.context[cacheKey] as {
      aging0to30: number;
      aging31to60: number;
      aging60Plus: number;
    };
  }

  const invoices = await fetchAllCustomerOpenInvoices(customerId, req);

  const now = Date.now();
  let aging0to30 = 0;
  let aging31to60 = 0;
  let aging60Plus = 0;

  for (const inv of invoices) {
    const balUSD = Number(inv.balanceUSD) || 0;
    if (balUSD <= 0) continue;

    const baseDateStr = (inv.dueDate || inv.issueDate) as string;
    const baseDate = baseDateStr ? new Date(baseDateStr).getTime() : now;
    const diffDays = Math.max(0, Math.floor((now - baseDate) / (1000 * 60 * 60 * 24)));

    if (diffDays <= 30) {
      aging0to30 += balUSD;
    } else if (diffDays <= 60) {
      aging31to60 += balUSD;
    } else {
      aging60Plus += balUSD;
    }
  }

  const result = {
    aging0to30: Number(aging0to30.toFixed(2)),
    aging31to60: Number(aging31to60.toFixed(2)),
    aging60Plus: Number(aging60Plus.toFixed(2)),
  };

  if (req.context) {
    req.context[cacheKey] = result;
  }

  return result;
}

const overdueDebtUSDHook: FieldHook = async ({ siblingData, req, value }) => {
  if (!siblingData?.id) return value ?? 0;
  return await computeLiveCustomerOverdueDebt(siblingData.id, req);
};

const aging0to30Hook: FieldHook = async ({ siblingData, req }) => {
  if (!siblingData?.id || !siblingData.currentDebtUSD) return 0;
  const aging = await getCustomerAging(siblingData.id, req);
  return aging.aging0to30;
};

const aging31to60Hook: FieldHook = async ({ siblingData, req }) => {
  if (!siblingData?.id || !siblingData.currentDebtUSD) return 0;
  const aging = await getCustomerAging(siblingData.id, req);
  return aging.aging31to60;
};

const aging60PlusHook: FieldHook = async ({ siblingData, req }) => {
  if (!siblingData?.id || !siblingData.currentDebtUSD) return 0;
  const aging = await getCustomerAging(siblingData.id, req);
  return aging.aging60Plus;
};

const whatsappDebtUrlHook: FieldHook = ({ siblingData }) => {
  const phone = siblingData?.phone?.replace(/[^0-9]/g, '');
  if (!phone) return '';

  const name = siblingData?.name || 'Cliente';
  const debtUSD = Number(siblingData?.currentDebtUSD) || 0;
  const debtVES = Number(siblingData?.currentDebtVES) || 0;
  const overdueUSD = Number(siblingData?.overdueDebtUSD) || 0;

  if (debtUSD <= 0) {
    return `https://wa.me/${phone}?text=${encodeURIComponent(
      `Estimado/a *${name}*, le informamos que se encuentra completamente solvente con su cuenta. ¡Muchas gracias por su preferencia!`,
    )}`;
  }

  const message = `Estimado/a *${name}*, le compartimos el resumen de su estado de cuenta a la fecha:
- Deuda Total: *$${debtUSD.toFixed(2)} USD* (~${debtVES.toFixed(2)} VES)
- Saldo Vencido: *$${overdueUSD.toFixed(2)} USD*
Por favor responder a este mensaje con su comprobante de pago. ¡Muchas gracias!`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
};

export const Customers: CollectionConfig = {
  slug: 'customers',
  labels: {
    singular: 'Cliente / CRM',
    plural: 'Clientes / CRM',
  },
  admin: {
    useAsTitle: 'name',
    group: 'Finanzas & CRM',
    defaultColumns: ['name', 'taxId', 'phone', 'status', 'currentDebtUSD'],
  },
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) =>
      Boolean(user?.role === 'super-admin' || user?.role === 'tenant-admin'),
  },
  endpoints: [
    {
      path: '/:id/statement',
      method: 'get',
      handler: async (req) => {
        // Enforce authentication
        if (!req.user) {
          return Response.json(
            { error: 'No autenticado: Se requiere iniciar sesión.' },
            { status: 401 },
          );
        }

        const customerId = req.routeParams?.id;
        if (!customerId) {
          return Response.json({ error: 'Customer ID is required' }, { status: 400 });
        }

        const customer = await req.payload.findByID({
          collection: 'customers',
          id: customerId as string,
          req,
        });

        if (!customer) {
          return Response.json({ error: 'Customer not found' }, { status: 404 });
        }

        // Multi-tenant authorization check
        if (req.user.role !== 'super-admin') {
          const userTenants = (
            (req.user as unknown as { tenants?: Array<{ tenant: number | { id: number } }> })
              ?.tenants || []
          ).map((t) =>
            typeof t.tenant === 'object' && t.tenant !== null ? t.tenant.id : t.tenant,
          );
          const customerTenantId =
            typeof customer.tenant === 'object' && customer.tenant !== null
              ? (customer.tenant as { id: number }).id
              : customer.tenant;

          if (
            !customerTenantId ||
            !userTenants.includes(customerTenantId as number)
          ) {
            return Response.json(
              { error: 'Prohibido: No tiene acceso a este inquilino.' },
              { status: 403 },
            );
          }
        }

        const allOpenInvoices = await fetchAllCustomerOpenInvoices(customerId, req);
        const aging = await getCustomerAging(customerId, req);

        return Response.json({
          customer: {
            id: customer.id,
            name: customer.name,
            taxId: customer.taxId,
            phone: customer.phone,
            email: customer.email,
            status: customer.status,
            currentDebtUSD: customer.currentDebtUSD,
            currentDebtVES: customer.currentDebtVES,
            overdueDebtUSD: customer.overdueDebtUSD,
          },
          aging,
          totalPendingInvoices: allOpenInvoices.length,
          pendingInvoices: allOpenInvoices.map((inv) => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            issueDate: inv.issueDate,
            dueDate: inv.dueDate,
            totalUSD: inv.totalUSD,
            balanceUSD: inv.balanceUSD,
            balanceVES: inv.balanceVES,
            status: inv.status,
          })),
          whatsappUrl: customer.whatsappDebtUrl,
        });
      },
    },
  ],
  fields: [
    {
      name: 'name',
      label: 'Razón Social / Nombre',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'taxId',
      label: 'RIF / Cédula de Identidad',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'phone',
      label: 'Teléfono WhatsApp (formato internacional +58...)',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'email',
      label: 'Correo Electrónico',
      type: 'email',
    },
    {
      name: 'address',
      label: 'Dirección Fiscal / Despacho',
      type: 'textarea',
    },
    {
      name: 'priceTier',
      label: 'Tier de Precio del Cliente',
      type: 'select',
      defaultValue: 'retail',
      index: true,
      options: [
        { label: 'Retail (detal)', value: 'retail' },
        { label: 'Wholesale (mayorista)', value: 'wholesale' },
        { label: 'Vendor (vendedor)', value: 'vendor' },
        { label: 'Promo (promoción)', value: 'promo' },
      ],
      admin: {
        description: 'Define qué lista de precios del catálogo aplica por defecto a este cliente.',
      },
    },
    {
      name: 'assignedVendor',
      label: 'Vendedor Asignado',
      type: 'relationship',
      relationTo: 'users',
      index: true,
      admin: {
        description: 'Representante comercial responsable de esta cuenta.',
      },
    },
    {
      name: 'commissionPct',
      label: 'Comisión del Vendedor (%)',
      type: 'number',
      min: 0,
      max: 100,
      defaultValue: 0,
      admin: {
        description: 'Porcentaje sobre facturas pagadas de este cliente, derivado para el vendedor asignado.',
      },
    },
    {
      name: 'status',
      label: 'Segmentación de Cliente',
      type: 'select',
      defaultValue: 'lead',
      required: true,
      options: [
        { label: 'Prospecto / Lead', value: 'lead' },
        { label: 'Primera Compra', value: 'first_time' },
        { label: 'Cliente Recurrente', value: 'recurring' },
        { label: 'Cliente VIP / Estratégico', value: 'vip' },
        { label: 'Inactivo / Suspendido', value: 'inactive' },
      ],
    },
    {
      name: 'creditAllowed',
      label: 'Permitir Ventas a Crédito',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'creditLimitUSD',
      label: 'Límite de Crédito Autorizado (USD)',
      type: 'number',
      defaultValue: 0,
      min: 0,
    },
    {
      name: 'creditDays',
      label: 'Días de Crédito Máximos',
      type: 'number',
      defaultValue: 0,
      min: 0,
    },
    // Ledger balances - stored in DB
    {
      name: 'currentDebtUSD',
      label: 'Deuda Total Pendiente (USD)',
      type: 'number',
      defaultValue: 0,
      admin: {
        readOnly: true,
      },
      custom: {
        'plugin-import-export': {
          disabled: true,
        },
      },
    },
    {
      name: 'currentDebtVES',
      label: 'Deuda Total Pendiente (VES)',
      type: 'number',
      defaultValue: 0,
      admin: {
        readOnly: true,
      },
      custom: {
        'plugin-import-export': {
          disabled: true,
        },
      },
    },
    {
      name: 'overdueDebtUSD',
      label: 'Deuda Vencida (USD)',
      type: 'number',
      defaultValue: 0,
      admin: {
        readOnly: true,
      },
      custom: {
        'plugin-import-export': {
          disabled: true,
        },
      },
      hooks: {
        afterRead: [overdueDebtUSDHook],
      },
    },
    // Virtual Aging Fields
    {
      name: 'aging0to30',
      label: 'Por Vencer / Corriente 0-30 días (USD)',
      type: 'number',
      virtual: true,
      admin: {
        readOnly: true,
      },
      hooks: {
        afterRead: [aging0to30Hook],
      },
    },
    {
      name: 'aging31to60',
      label: 'Vencido 31-60 días (USD)',
      type: 'number',
      virtual: true,
      admin: {
        readOnly: true,
      },
      hooks: {
        afterRead: [aging31to60Hook],
      },
    },
    {
      name: 'aging60Plus',
      label: 'Vencido más de 60 días (USD)',
      type: 'number',
      virtual: true,
      admin: {
        readOnly: true,
      },
      hooks: {
        afterRead: [aging60PlusHook],
      },
    },
    // Relación inversa nativa: pedidos del cliente (Sprint 19)
    {
      name: 'orders',
      label: 'Pedidos',
      type: 'join',
      collection: 'orders',
      on: 'customer',
      admin: {
        allowCreate: false,
        defaultColumns: ['orderNumber', 'status', 'totalUSD', 'createdAt'],
        description: 'Pedidos de venta asociados a este cliente.',
      },
    },
    // Virtual WhatsApp direct bill link
    {
      name: 'whatsappDebtUrl',
      label: 'Enlace Directo de Cobranza WhatsApp',
      type: 'text',
      virtual: true,
      admin: {
        readOnly: true,
      },
      hooks: {
        afterRead: [whatsappDebtUrlHook],
      },
    },
  ],
  timestamps: true,
};
