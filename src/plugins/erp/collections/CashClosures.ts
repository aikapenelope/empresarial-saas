import type { CollectionConfig } from 'payload';

export const CashClosures: CollectionConfig = {
  slug: 'cash-closures',
  labels: {
    singular: 'Cierre de Caja / Turno',
    plural: 'Cierres de Caja & Arqueos',
  },
  admin: {
    useAsTitle: 'closureNumber',
    defaultColumns: ['closureNumber', 'cashRegister', 'openedBy', 'openedAt', 'status'],
    group: 'Caja & Puntos de Venta',
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

        if (operation === 'create') {
          if (!data.closureNumber) {
            const timestamp = Date.now().toString().slice(-6);
            const random = Math.floor(Math.random() * 900 + 100);
            data.closureNumber = `CC-${timestamp}-${random}`;
          }
          data.openedAt = data.openedAt || new Date().toISOString();
          if (!data.openedBy && req.user?.id) {
            data.openedBy = req.user.id;
          }
        }

        // Calcular diferencias de arqueo si el turno está cerrando o cerrado
        if (data.status === 'closed' || data.status === 'audited') {
          data.closedAt = data.closedAt || new Date().toISOString();
          if (!data.closedBy && req.user?.id) {
            data.closedBy = req.user.id;
          }

          const openFloatUSD = Number(data.openingFloat?.cashUSD) || 0;
          const openFloatVES = Number(data.openingFloat?.cashVES) || 0;

          const sysCashUSD = Number(data.systemTotals?.cashUSD) || 0;
          const sysCashVES = Number(data.systemTotals?.cashVES) || 0;
          const sysPagoMovil = Number(data.systemTotals?.pagoMovilVES) || 0;
          const sysZelle = Number(data.systemTotals?.zelleUSD) || 0;

          const declCashUSD = Number(data.declaredTotals?.cashUSD) || 0;
          const declCashVES = Number(data.declaredTotals?.cashVES) || 0;
          const declPagoMovil = Number(data.declaredTotals?.pagoMovilVES) || 0;
          const declZelle = Number(data.declaredTotals?.zelleUSD) || 0;

          const diffCashUSD = Math.round((declCashUSD - (openFloatUSD + sysCashUSD)) * 100) / 100;
          const diffCashVES = Math.round((declCashVES - (openFloatVES + sysCashVES)) * 100) / 100;
          const diffPagoMovil = Math.round((declPagoMovil - sysPagoMovil) * 100) / 100;
          const diffZelle = Math.round((declZelle - sysZelle) * 100) / 100;

          const hasDiscrepancy = diffCashUSD !== 0 || diffCashVES !== 0 || diffPagoMovil !== 0 || diffZelle !== 0;

          data.differences = {
            diffCashUSD,
            diffCashVES,
            diffPagoMovilVES: diffPagoMovil,
            diffZelleUSD: diffZelle,
            hasDiscrepancy,
          };
        }

        return data;
      },
    ],
    afterChange: [
      async ({ doc, req }) => {
        if (!doc) return;

        const registerId = typeof doc.cashRegister === 'object' && doc.cashRegister !== null
          ? doc.cashRegister.id
          : doc.cashRegister;

        if (registerId) {
          try {
            const newStatus = doc.status === 'open' ? 'open' : 'closed';
            await req.payload.update({
              collection: 'cash-registers',
              id: String(registerId),
              data: {
                currentStatus: newStatus,
              },
              req,
              overrideAccess: true,
            });
          } catch (err) {
            req.payload.logger.error({ err }, `Error updating cash register status for ${registerId}`);
          }
        }
      },
    ],
  },
  fields: [
    {
      name: 'closureNumber',
      label: 'N° de Cierre / Turno',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'cashRegister',
      label: 'Caja Registradora',
      type: 'relationship',
      relationTo: 'cash-registers',
      required: true,
      index: true,
    },
    {
      name: 'openedBy',
      label: 'Cajero / Operador que Abre',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'closedBy',
      label: 'Cajero o Supervisor que Cierra',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'status',
      label: 'Estado del Turno',
      type: 'select',
      defaultValue: 'open',
      options: [
        { label: 'Turno Abierto (En Operación)', value: 'open' },
        { label: 'Turno Cerrado', value: 'closed' },
        { label: 'Auditado y Aprobado', value: 'audited' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'openedAt',
      label: 'Fecha y Hora de Apertura',
      type: 'date',
      required: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'closedAt',
      label: 'Fecha y Hora de Cierre',
      type: 'date',
      admin: {
        position: 'sidebar',
      },
    },
    // --- Fondo de Caja Inicial ---
    {
      name: 'openingFloat',
      label: 'Fondo de Apertura (Caja Chica Inicial)',
      type: 'group',
      fields: [
        {
          name: 'cashUSD',
          label: 'Efectivo Inicial en Dólares ($)',
          type: 'number',
          defaultValue: 0,
        },
        {
          name: 'cashVES',
          label: 'Efectivo Inicial en Bolívares (Bs)',
          type: 'number',
          defaultValue: 0,
        },
      ],
    },
    // --- Ventas Calculadas por el Sistema ---
    {
      name: 'systemTotals',
      label: 'Totales Calculados por el Sistema durante el Turno',
      type: 'group',
      fields: [
        {
          name: 'cashUSD',
          label: 'Ventas en Efectivo USD ($)',
          type: 'number',
          defaultValue: 0,
        },
        {
          name: 'cashVES',
          label: 'Ventas en Efectivo Bolívares (Bs)',
          type: 'number',
          defaultValue: 0,
        },
        {
          name: 'pagoMovilVES',
          label: 'Cobros por Pago Móvil (Bs)',
          type: 'number',
          defaultValue: 0,
        },
        {
          name: 'transferVES',
          label: 'Cobros por Transferencia (Bs)',
          type: 'number',
          defaultValue: 0,
        },
        {
          name: 'zelleUSD',
          label: 'Cobros por Zelle ($)',
          type: 'number',
          defaultValue: 0,
        },
        {
          name: 'binanceUSD',
          label: 'Cobros por Binance USDT ($)',
          type: 'number',
          defaultValue: 0,
        },
        {
          name: 'totalSalesUSD',
          label: 'Ventas Totales Consolidadas (USD)',
          type: 'number',
          defaultValue: 0,
        },
      ],
    },
    // --- Conteo Físico Declarado por el Cajero ---
    {
      name: 'declaredTotals',
      label: 'Arqueo Físico Declarado por el Cajero al Cierre',
      type: 'group',
      fields: [
        {
          name: 'cashUSD',
          label: 'Efectivo Físico Contado ($)',
          type: 'number',
          defaultValue: 0,
        },
        {
          name: 'cashVES',
          label: 'Efectivo Físico Contado (Bs)',
          type: 'number',
          defaultValue: 0,
        },
        {
          name: 'pagoMovilVES',
          label: 'Comprobantes Pago Móvil (Bs)',
          type: 'number',
          defaultValue: 0,
        },
        {
          name: 'transferVES',
          label: 'Comprobantes Transferencias (Bs)',
          type: 'number',
          defaultValue: 0,
        },
        {
          name: 'zelleUSD',
          label: 'Confirmaciones Zelle ($)',
          type: 'number',
          defaultValue: 0,
        },
        {
          name: 'binanceUSD',
          label: 'Confirmaciones Binance ($)',
          type: 'number',
          defaultValue: 0,
        },
      ],
    },
    // --- Diferencias Calculadas ---
    {
      name: 'differences',
      label: 'Diferencias del Cuadre de Caja (Sobrante / Faltante)',
      type: 'group',
      fields: [
        {
          name: 'diffCashUSD',
          label: 'Diferencia Efectivo USD (+ Sobrante / - Faltante)',
          type: 'number',
          admin: {
            readOnly: true,
          },
        },
        {
          name: 'diffCashVES',
          label: 'Diferencia Efectivo Bs (+ Sobrante / - Faltante)',
          type: 'number',
          admin: {
            readOnly: true,
          },
        },
        {
          name: 'diffPagoMovilVES',
          label: 'Diferencia Pago Móvil Bs',
          type: 'number',
          admin: {
            readOnly: true,
          },
        },
        {
          name: 'diffZelleUSD',
          label: 'Diferencia Zelle USD',
          type: 'number',
          admin: {
            readOnly: true,
          },
        },
        {
          name: 'hasDiscrepancy',
          label: 'Presenta Descuadre',
          type: 'checkbox',
          admin: {
            readOnly: true,
          },
        },
      ],
    },
    {
      name: 'notes',
      label: 'Justificaciones y Observaciones de Cierre',
      type: 'textarea',
    },
  ],
  endpoints: [
    {
      path: '/:id/close',
      method: 'post',
      handler: async (req) => {
        const id = req.routeParams?.id;
        if (!id) {
          return Response.json({ error: 'Closure ID is required' }, { status: 400 });
        }

        const body = (await req.json?.()) || {};
        const declared = body.declaredTotals || {};

        const closure = await req.payload.findByID({
          collection: 'cash-closures',
          id: String(id),
          depth: 0,
          req,
        });

        if (!closure) {
          return Response.json({ error: 'Cash closure not found' }, { status: 404 });
        }

        if (closure.status !== 'open') {
          return Response.json({ error: 'This cash closure session is already closed' }, { status: 400 });
        }

        const closeTime = new Date().toISOString();

        // Computar todos los cobros de clientes recibidos entre openedAt y closeTime
        const payments = await req.payload.find({
          collection: 'customer-payments',
          where: {
            and: [
              { paymentDate: { greater_than_equal: closure.openedAt } },
              { paymentDate: { less_than_equal: closeTime } },
            ],
          },
          limit: 1000,
          depth: 0,
          req,
        });

        let sysCashUSD = 0;
        let sysCashVES = 0;
        let sysPagoMovil = 0;
        let sysTransfer = 0;
        let sysZelle = 0;
        let sysBinance = 0;
        let totalSalesUSD = 0;

        for (const p of payments.docs) {
          const usd = Number(p.amountUSD) || 0;
          const ves = Number(p.amountVES) || 0;
          totalSalesUSD += usd;

          switch (p.paymentMethod) {
            case 'cash_usd':
              sysCashUSD += usd;
              break;
            case 'cash_ves':
              sysCashVES += ves;
              break;
            case 'pago_movil':
              sysPagoMovil += ves;
              break;
            case 'transfer_ves':
              sysTransfer += ves;
              break;
            case 'zelle':
              sysZelle += usd;
              break;
            case 'binance':
              sysBinance += usd;
              break;
          }
        }

        const updatedClosure = await req.payload.update({
          collection: 'cash-closures',
          id: String(id),
          data: {
            status: 'closed',
            closedAt: closeTime,
            systemTotals: {
              cashUSD: sysCashUSD,
              cashVES: sysCashVES,
              pagoMovilVES: sysPagoMovil,
              transferVES: sysTransfer,
              zelleUSD: sysZelle,
              binanceUSD: sysBinance,
              totalSalesUSD,
            },
            declaredTotals: {
              cashUSD: Number(declared.cashUSD) || 0,
              cashVES: Number(declared.cashVES) || 0,
              pagoMovilVES: Number(declared.pagoMovilVES) || 0,
              transferVES: Number(declared.transferVES) || 0,
              zelleUSD: Number(declared.zelleUSD) || 0,
              binanceUSD: Number(declared.binanceUSD) || 0,
            },
            notes: body.notes || closure.notes,
          },
          req,
        });

        return Response.json({
          message: 'Cash closure processed successfully',
          closure: updatedClosure,
        });
      },
    },
  ],
};
