import type { CollectionConfig } from 'payload';

export const Customers: CollectionConfig = {
  slug: 'customers',
  labels: {
    singular: 'Cliente',
    plural: 'Clientes',
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'rifCi', 'phone', 'currentDebtUSD', 'overdueDebtUSD', 'lifecycleStage'],
    group: 'Finanzas & CRM',
  },
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => Boolean(user),
  },
  fields: [
    {
      name: 'name',
      label: 'Razón Social / Nombre',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'legalName',
      label: 'Nombre Comercial / Fantasía',
      type: 'text',
    },
    {
      name: 'rifCi',
      label: 'RIF / Cédula Fiscal',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'phone',
      label: 'Teléfono (WhatsApp)',
      type: 'text',
      required: true,
      validate: (value: unknown) => {
        if (typeof value !== 'string') return 'El teléfono es requerido.';
        const clean = value.replace(/\D/g, '');
        if (clean.length < 8) {
          return 'El teléfono debe contener al menos 8 dígitos (ej. +584121234567).';
        }
        return true;
      },
    },
    {
      name: 'email',
      label: 'Correo Electrónico',
      type: 'email',
    },
    {
      name: 'address',
      label: 'Dirección Fiscal / Entrega',
      type: 'textarea',
    },
    {
      name: 'lifecycleStage',
      label: 'Etapa CRM / Tipo de Cliente',
      type: 'select',
      defaultValue: 'first_time',
      options: [
        { label: 'Prospecto / Lead', value: 'lead' },
        { label: 'Primera Compra', value: 'first_time' },
        { label: 'Cliente Recurrente', value: 'recurring' },
        { label: 'Cliente VIP / Mayorista', value: 'vip' },
        { label: 'Inactivo / En Riesgo', value: 'inactive' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'creditConfig',
      label: 'Condiciones de Crédito',
      type: 'group',
      fields: [
        {
          name: 'creditAllowed',
          label: 'Permitir Crédito',
          type: 'checkbox',
          defaultValue: false,
        },
        {
          name: 'creditLimitUSD',
          label: 'Límite de Crédito (USD)',
          type: 'number',
          defaultValue: 0,
          admin: {
            condition: (_data, siblingData) => Boolean(siblingData?.creditAllowed),
          },
        },
        {
          name: 'creditDays',
          label: 'Días de Crédito Otorgados',
          type: 'number',
          defaultValue: 15,
          admin: {
            condition: (_data, siblingData) => Boolean(siblingData?.creditAllowed),
          },
        },
      ],
    },
    // --- Campos de Balance y Ledger (Persistidos y Gobernados por Hooks) ---
    {
      name: 'currentDebtUSD',
      label: 'Deuda Total (USD)',
      type: 'number',
      defaultValue: 0,
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'currentDebtVES',
      label: 'Deuda Total (Bs / Local)',
      type: 'number',
      defaultValue: 0,
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'overdueDebtUSD',
      label: 'Deuda Vencida (USD)',
      type: 'number',
      defaultValue: 0,
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'lastPaymentDate',
      label: 'Última Fecha de Abono',
      type: 'date',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    // --- Campos Virtuales de Agilidad y UX ---
    {
      name: 'whatsappChatUrl',
      label: 'Enlace a WhatsApp',
      type: 'text',
      virtual: true,
      admin: {
        readOnly: true,
      },
      hooks: {
        afterRead: [
          ({ data }) => {
            const rawPhone = data?.phone;
            if (!rawPhone || typeof rawPhone !== 'string') return null;
            const digits = rawPhone.replace(/\D/g, '');
            return `https://wa.me/${digits}`;
          },
        ],
      },
    },
    {
      name: 'creditStatus',
      label: 'Estado de Crédito',
      type: 'text',
      virtual: true,
      admin: {
        readOnly: true,
      },
      hooks: {
        afterRead: [
          ({ data }) => {
            const limit = Number(data?.creditConfig?.creditLimitUSD) || 0;
            const debt = Number(data?.currentDebtUSD) || 0;
            const overdue = Number(data?.overdueDebtUSD) || 0;

            if (overdue > 0) return 'overdue'; // En mora vencida
            if (limit > 0 && debt >= limit) return 'exceeded'; // Límite alcanzado
            if (limit > 0 && debt >= limit * 0.8) return 'near_limit'; // Cerca del límite
            return 'ok';
          },
        ],
      },
    },
    {
      name: 'notes',
      label: 'Notas de Seguimiento Comercial / Bitácora',
      type: 'textarea',
    },
  ],
  endpoints: [
    {
      path: '/:id/statement',
      method: 'get',
      handler: async (req) => {
        const id = req.routeParams?.id;
        if (!id) {
          return Response.json({ error: 'Customer ID is required' }, { status: 400 });
        }

        const customer = await req.payload.findByID({
          collection: 'customers',
          id: String(id),
          depth: 0,
          req,
        });

        if (!customer) {
          return Response.json({ error: 'Customer not found' }, { status: 404 });
        }

        const invoices = await req.payload.find({
          collection: 'invoices',
          where: {
            and: [
              { customer: { equals: id } },
              { balanceUSD: { greater_than: 0 } },
              { status: { not_equals: 'cancelled' } },
            ],
          },
          sort: 'dueDate',
          limit: 100,
          depth: 0,
          req,
        });

        const cleanPhone = customer.phone?.replace(/\D/g, '') || '';
        const overdueInvoices = invoices.docs.filter((inv) => inv.dueDate && new Date(inv.dueDate) < new Date());

        const statementText = `Hola *${customer.name}*, te compartimos tu estado de cuenta actual:\n\n` +
          `💰 *Saldo Total Pendiente:* $${customer.currentDebtUSD?.toFixed(2) || '0.00'}\n` +
          (customer.overdueDebtUSD && customer.overdueDebtUSD > 0
            ? `⚠️ *Saldo Vencido:* $${customer.overdueDebtUSD.toFixed(2)}\n`
            : `✅ *Estado:* Al día\n`) +
          `📄 *Facturas Pendientes:* ${invoices.docs.length}\n\n` +
          `Para conciliar tus pagos o transferencias, por favor indícanos el comprobante por este medio.`;

        const whatsappMessageUrl = cleanPhone
          ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(statementText)}`
          : null;

        return Response.json({
          customer: {
            id: customer.id,
            name: customer.name,
            rifCi: customer.rifCi,
            phone: customer.phone,
            currentDebtUSD: customer.currentDebtUSD,
            currentDebtVES: customer.currentDebtVES,
            overdueDebtUSD: customer.overdueDebtUSD,
          },
          summary: {
            pendingInvoicesCount: invoices.docs.length,
            overdueInvoicesCount: overdueInvoices.length,
          },
          invoices: invoices.docs.map((inv) => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            totalUSD: inv.totalUSD,
            balanceUSD: inv.balanceUSD,
            exchangeRateSnapshot: inv.exchangeRateSnapshot,
            balanceVES: inv.balanceVES,
            dueDate: inv.dueDate,
            isOverdue: inv.dueDate ? new Date(inv.dueDate) < new Date() : false,
          })),
          whatsappMessageUrl,
        });
      },
    },
  ],
};
