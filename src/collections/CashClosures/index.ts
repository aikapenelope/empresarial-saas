import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeDeleteHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
} from 'payload';
import {
  assertNoOpenShiftForRegister,
  calculateShiftDifferences,
  computeShiftTransactions,
  extractId,
  updateCashRegisterOperationalStatus,
  type DeclaredTotalsInput,
  type OpeningFloatInput,
} from '../../utilities/cashLedger';
import { resolveEffectiveRate } from '../../utilities/exchangeRate';

const beforeValidateCashClosure: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  operation,
  req,
}) => {
  if (!data) return data;

  const tenantId = extractId(data.tenant || originalDoc?.tenant);
  const registerId = extractId(data.cashRegister || originalDoc?.cashRegister);

  if (!registerId) {
    throw new Error('Debe especificar una caja registradora para la sesión de turno.');
  }

  // 1. Validaciones en Apertura de Turno (Create)
  if (operation === 'create') {
    if (!data.closureNumber) {
      const now = new Date();
      const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      data.closureNumber = `TURNO-${datePart}-${randomSuffix}`;
    }

    if (!data.openedAt) {
      data.openedAt = new Date().toISOString();
    }

    if (!data.openedBy && req.user?.id) {
      data.openedBy = req.user.id;
    }

    // Validar que la caja exista y pertenezca al mismo tenant
    const register = await req.payload.findByID({
      collection: 'cash-registers',
      id: registerId,
      depth: 0,
      req,
    });

    if (!register) {
      throw new Error(`La caja registradora con ID ${registerId} no existe.`);
    }

    if (!register.active) {
      throw new Error('La caja registradora seleccionada se encuentra deshabilitada.');
    }

    const regTenantId = extractId(register.tenant);
    if (tenantId && regTenantId && String(tenantId) !== String(regTenantId)) {
      throw new Error('La caja registradora pertenece a otra empresa.');
    }

    // Validar asignación de usuarios a la caja si existen restricciones
    if (
      Array.isArray(register.assignedUsers) &&
      register.assignedUsers.length > 0 &&
      req.user?.role === 'cashier'
    ) {
      const userAssigned = register.assignedUsers.some(
        (u) => String(extractId(u)) === String(req.user?.id),
      );
      if (!userAssigned) {
        throw new Error('El usuario no está autorizado para abrir turno en esta caja registradora.');
      }
    }

    // Verificar que no exista otra sesión de turno abierta simultáneamente en la misma caja
    await assertNoOpenShiftForRegister({
      cashRegisterId: registerId,
      req,
    });
  }

  // 2. Transición o Procesamiento de Cierre de Turno ('closed' o 'audited')
  const status = data.status || originalDoc?.status || 'open';

  if (status === 'closed' || status === 'audited') {
    if (!data.closedAt && !originalDoc?.closedAt) {
      data.closedAt = new Date().toISOString();
    }

    if (!data.closedBy && !originalDoc?.closedBy && req.user?.id) {
      data.closedBy = req.user.id;
    }

    const openedAt = data.openedAt || originalDoc?.openedAt || new Date().toISOString();
    const closedAt = data.closedAt || originalDoc?.closedAt || new Date().toISOString();

    const openingFloat = (data.openingFloat || originalDoc?.openingFloat || {}) as OpeningFloatInput;
    const declaredTotals = (data.declaredTotals || originalDoc?.declaredTotals || {}) as DeclaredTotalsInput;

    // Obtener tasa de cambio efectiva del tenant para cálculo consolidado de descuadres
    const { rate: exchangeRate } = await resolveEffectiveRate();

    // Consolidar transacciones del sistema del turno
    const shiftTotals = await computeShiftTransactions({
      closureId: originalDoc?.id,
      cashRegisterId: registerId,
      tenantId,
      openedAt,
      closedAt,
      openingFloat,
      req,
    });

    data.systemTotals = {
      collections: shiftTotals.collections,
      disbursements: shiftTotals.disbursements,
      expected: shiftTotals.expected,
    };

    // Calcular diferencias de arqueo ciego (sobrante o faltante)
    const differences = calculateShiftDifferences({
      declaredTotals,
      expected: shiftTotals.expected,
      exchangeRate,
    });

    data.differences = differences;
  }

  // 3. Auditoría del Cierre
  if (status === 'audited') {
    const userRole = req.user?.role;
    if (userRole !== 'super-admin' && userRole !== 'tenant-admin' && userRole !== 'supervisor') {
      throw new Error('Solo un supervisor o administrador puede auditar y aprobar un cierre de caja.');
    }

    if (!data.auditedAt && !originalDoc?.auditedAt) {
      data.auditedAt = new Date().toISOString();
    }
    if (!data.auditedBy && !originalDoc?.auditedBy && req.user?.id) {
      data.auditedBy = req.user.id;
    }
  }

  return data;
};

const afterChangeCashClosure: CollectionAfterChangeHook = async ({ doc, req }) => {
  if (!doc) return;

  const registerId = extractId(doc.cashRegister);
  if (!registerId) return;

  const newStatus = doc.status === 'open' ? 'open' : 'closed';
  const currentClosureId = doc.status === 'open' ? doc.id : null;

  await updateCashRegisterOperationalStatus({
    cashRegisterId: registerId,
    newStatus,
    currentClosureId,
    req,
  });
};

const beforeDeleteCashClosure: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const closure = await req.payload.findByID({
    collection: 'cash-closures',
    id,
    depth: 0,
    req,
  });

  if (closure && (closure.status === 'closed' || closure.status === 'audited')) {
    throw new Error(
      'No se puede eliminar un cierre de caja ya cerrado o auditado. Los registros contables de turno son inmutables.',
    );
  }
};

const afterDeleteCashClosure: CollectionAfterDeleteHook = async ({ doc, req }) => {
  if (!doc) return;
  const registerId = extractId(doc.cashRegister);
  if (registerId && doc.status === 'open') {
    await updateCashRegisterOperationalStatus({
      cashRegisterId: registerId,
      newStatus: 'closed',
      currentClosureId: null,
      req,
    });
  }
};

export const CashClosures: CollectionConfig = {
  slug: 'cash-closures',
  labels: {
    singular: 'Cierre de Caja / Turno',
    plural: 'Cierres de Caja & Arqueos',
  },
  admin: {
    useAsTitle: 'closureNumber',
    group: 'Caja & Puntos de Venta',
    defaultColumns: ['closureNumber', 'cashRegister', 'openedBy', 'openedAt', 'closedAt', 'status'],
  },
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) =>
      Boolean(user?.role === 'super-admin' || user?.role === 'tenant-admin'),
  },
  hooks: {
    beforeValidate: [beforeValidateCashClosure],
    afterChange: [afterChangeCashClosure],
    beforeDelete: [beforeDeleteCashClosure],
    afterDelete: [afterDeleteCashClosure],
  },
  fields: [
    {
      name: 'closureNumber',
      label: 'Número de Cierre / Turno',
      type: 'text',
      required: true,
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
      name: 'auditedBy',
      label: 'Supervisor que Audita',
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
      required: true,
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
      defaultValue: () => new Date().toISOString(),
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
    {
      name: 'auditedAt',
      label: 'Fecha y Hora de Auditoría',
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
          min: 0,
        },
        {
          name: 'cashVES',
          label: 'Efectivo Inicial en Bolívares (Bs)',
          type: 'number',
          defaultValue: 0,
          min: 0,
        },
        {
          name: 'notes',
          label: 'Observaciones de Apertura',
          type: 'text',
        },
      ],
    },
    // --- Arqueo Ciego Físico Declarado por el Cajero ---
    {
      name: 'declaredTotals',
      label: 'Arqueo Físico Declarado por el Cajero al Cierre',
      type: 'group',
      fields: [
        {
          name: 'cashUSD',
          label: 'Efectivo Físico Contado ($ USD)',
          type: 'number',
          defaultValue: 0,
          min: 0,
        },
        {
          name: 'cashVES',
          label: 'Efectivo Físico Contado (Bs VES)',
          type: 'number',
          defaultValue: 0,
          min: 0,
        },
        {
          name: 'posVES',
          label: 'Comprobantes Punto de Venta / Lote (Bs)',
          type: 'number',
          defaultValue: 0,
          min: 0,
        },
        {
          name: 'pagoMovilVES',
          label: 'Comprobantes Pago Móvil (Bs)',
          type: 'number',
          defaultValue: 0,
          min: 0,
        },
        {
          name: 'transferVES',
          label: 'Comprobantes Transferencias Bancarias (Bs)',
          type: 'number',
          defaultValue: 0,
          min: 0,
        },
        {
          name: 'zelleUSD',
          label: 'Confirmaciones Zelle ($ USD)',
          type: 'number',
          defaultValue: 0,
          min: 0,
        },
        {
          name: 'binanceUSD',
          label: 'Confirmaciones Binance USDT ($)',
          type: 'number',
          defaultValue: 0,
          min: 0,
        },
      ],
    },
    // --- Totales del Sistema Computados Automáticamente ---
    {
      name: 'systemTotals',
      label: 'Totales Consolidados por el Sistema',
      type: 'group',
      fields: [
        {
          name: 'collections',
          label: 'Ingresos por Cobranzas a Clientes',
          type: 'group',
          fields: [
            { name: 'cashUSD', label: 'Efectivo USD ($)', type: 'number', defaultValue: 0, admin: { readOnly: true } },
            { name: 'cashVES', label: 'Efectivo VES (Bs)', type: 'number', defaultValue: 0, admin: { readOnly: true } },
            { name: 'posVES', label: 'Punto de Venta (Bs)', type: 'number', defaultValue: 0, admin: { readOnly: true } },
            { name: 'pagoMovilVES', label: 'Pago Móvil (Bs)', type: 'number', defaultValue: 0, admin: { readOnly: true } },
            { name: 'transferVES', label: 'Transferencias (Bs)', type: 'number', defaultValue: 0, admin: { readOnly: true } },
            { name: 'zelleUSD', label: 'Zelle ($)', type: 'number', defaultValue: 0, admin: { readOnly: true } },
            { name: 'binanceUSD', label: 'Binance USDT ($)', type: 'number', defaultValue: 0, admin: { readOnly: true } },
            { name: 'totalCollectionsUSD', label: 'Total Ingresos (USD)', type: 'number', defaultValue: 0, admin: { readOnly: true } },
          ],
        },
        {
          name: 'disbursements',
          label: 'Egresos por Pagos a Proveedores / Gastos Menores',
          type: 'group',
          fields: [
            { name: 'cashUSDOut', label: 'Efectivo USD Egresado ($)', type: 'number', defaultValue: 0, admin: { readOnly: true } },
            { name: 'cashVESOut', label: 'Efectivo VES Egresado (Bs)', type: 'number', defaultValue: 0, admin: { readOnly: true } },
            { name: 'posVESOut', label: 'Punto de Venta Egresado (Bs)', type: 'number', defaultValue: 0, admin: { readOnly: true } },
            { name: 'pagoMovilVESOut', label: 'Pago Móvil Egresado (Bs)', type: 'number', defaultValue: 0, admin: { readOnly: true } },
            { name: 'transferVESOut', label: 'Transferencias Egresadas (Bs)', type: 'number', defaultValue: 0, admin: { readOnly: true } },
            { name: 'zelleUSDOut', label: 'Zelle Egresado ($)', type: 'number', defaultValue: 0, admin: { readOnly: true } },
            { name: 'binanceUSDOut', label: 'Binance Egresado ($)', type: 'number', defaultValue: 0, admin: { readOnly: true } },
            { name: 'totalDisbursementsUSD', label: 'Total Egresos (USD)', type: 'number', defaultValue: 0, admin: { readOnly: true } },
          ],
        },
        {
          name: 'expected',
          label: 'Monto Neto Esperado en Caja (Apertura + Ingresos - Egresos)',
          type: 'group',
          fields: [
            { name: 'expectedCashUSD', label: 'Esperado Efectivo USD ($)', type: 'number', defaultValue: 0, admin: { readOnly: true } },
            { name: 'expectedCashVES', label: 'Esperado Efectivo VES (Bs)', type: 'number', defaultValue: 0, admin: { readOnly: true } },
            { name: 'expectedPosVES', label: 'Esperado Punto de Venta (Bs)', type: 'number', defaultValue: 0, admin: { readOnly: true } },
            { name: 'expectedPagoMovilVES', label: 'Esperado Pago Móvil (Bs)', type: 'number', defaultValue: 0, admin: { readOnly: true } },
            { name: 'expectedTransferVES', label: 'Esperado Transferencias (Bs)', type: 'number', defaultValue: 0, admin: { readOnly: true } },
            { name: 'expectedZelleUSD', label: 'Esperado Zelle ($)', type: 'number', defaultValue: 0, admin: { readOnly: true } },
            { name: 'expectedBinanceUSD', label: 'Esperado Binance ($)', type: 'number', defaultValue: 0, admin: { readOnly: true } },
            { name: 'netTotalUSD', label: 'Recaudación Neta Total (USD)', type: 'number', defaultValue: 0, admin: { readOnly: true } },
          ],
        },
      ],
    },
    // --- Diferencias del Cuadre de Caja (Sobrante / Faltante) ---
    {
      name: 'differences',
      label: 'Diferencias del Cuadre de Arqueo (+ Sobrante / - Faltante)',
      type: 'group',
      fields: [
        { name: 'diffCashUSD', label: 'Diferencia Efectivo USD ($)', type: 'number', defaultValue: 0, admin: { readOnly: true } },
        { name: 'diffCashVES', label: 'Diferencia Efectivo VES (Bs)', type: 'number', defaultValue: 0, admin: { readOnly: true } },
        { name: 'diffPosVES', label: 'Diferencia Punto de Venta (Bs)', type: 'number', defaultValue: 0, admin: { readOnly: true } },
        { name: 'diffPagoMovilVES', label: 'Diferencia Pago Móvil (Bs)', type: 'number', defaultValue: 0, admin: { readOnly: true } },
        { name: 'diffTransferVES', label: 'Diferencia Transferencias (Bs)', type: 'number', defaultValue: 0, admin: { readOnly: true } },
        { name: 'diffZelleUSD', label: 'Diferencia Zelle ($)', type: 'number', defaultValue: 0, admin: { readOnly: true } },
        { name: 'diffBinanceUSD', label: 'Diferencia Binance ($)', type: 'number', defaultValue: 0, admin: { readOnly: true } },
        { name: 'totalDiscrepancyUSD', label: 'Descuadre Neto Consolidado (USD)', type: 'number', defaultValue: 0, admin: { readOnly: true } },
        { name: 'hasDiscrepancy', label: 'Presenta Descuadre de Caja', type: 'checkbox', defaultValue: false, admin: { readOnly: true } },
      ],
    },
    {
      name: 'notes',
      label: 'Justificaciones y Observaciones del Cajero',
      type: 'textarea',
    },
    {
      name: 'supervisorNotes',
      label: 'Observaciones de Auditoría / Supervisión',
      type: 'textarea',
    },
  ],
  endpoints: [
    {
      path: '/:id/summary',
      method: 'get',
      handler: async (req) => {
        const id = req.routeParams?.id;
        if (!id) {
          return Response.json({ error: 'ID de cierre no especificado' }, { status: 400 });
        }

        const closure = await req.payload.findByID({
          collection: 'cash-closures',
          id: String(id),
          depth: 0,
          req,
        });

        if (!closure) {
          return Response.json({ error: 'Cierre de caja no encontrado' }, { status: 404 });
        }

        const registerId = extractId(closure.cashRegister);
        if (!registerId) {
          return Response.json({ error: 'La caja registradora asociada es inválida' }, { status: 400 });
        }

        const shiftTotals = await computeShiftTransactions({
          closureId: closure.id,
          cashRegisterId: registerId,
          tenantId: extractId(closure.tenant),
          openedAt: closure.openedAt,
          closedAt: closure.closedAt || new Date().toISOString(),
          openingFloat: closure.openingFloat,
          req,
        });

        return Response.json({
          success: true,
          closureNumber: closure.closureNumber,
          status: closure.status,
          openedAt: closure.openedAt,
          totals: shiftTotals,
        });
      },
    },
    {
      path: '/:id/close',
      method: 'post',
      handler: async (req) => {
        const id = req.routeParams?.id;
        if (!id) {
          return Response.json({ error: 'ID de cierre no especificado' }, { status: 400 });
        }

        const body = ((await req.json?.()) || {}) as {
          declaredTotals?: DeclaredTotalsInput;
          notes?: string;
        };

        const closure = await req.payload.findByID({
          collection: 'cash-closures',
          id: String(id),
          depth: 0,
          req,
        });

        if (!closure) {
          return Response.json({ error: 'Cierre de caja no encontrado' }, { status: 404 });
        }

        if (closure.status !== 'open') {
          return Response.json(
            { error: 'Esta sesión de turno ya se encuentra cerrada o auditada.' },
            { status: 400 },
          );
        }

        const updatedClosure = await req.payload.update({
          collection: 'cash-closures',
          id: String(id),
          data: {
            status: 'closed',
            closedAt: new Date().toISOString(),
            closedBy: req.user?.id,
            declaredTotals: body.declaredTotals || closure.declaredTotals,
            notes: body.notes !== undefined ? body.notes : closure.notes,
          },
          req,
        });

        return Response.json({
          success: true,
          message: 'Turno cerrado y arqueo procesado exitosamente',
          closure: updatedClosure,
        });
      },
    },
  ],
  timestamps: true,
};
