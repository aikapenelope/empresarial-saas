import type {
  CollectionBeforeDeleteHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
  FieldHook,
} from 'payload';
import { sql } from '@payloadcms/db-postgres';
import {
  computeLiveSupplierOverdueDebt,
  extractId,
  fetchAllSupplierOpenInvoices,
  getActiveDb,
  getSupplierAging,
  getUserTenantIds,
} from '../../utilities/purchasesLedger';

const overdueDebtUSDHook: FieldHook = async ({ siblingData, req, value }) => {
  if (!siblingData?.id) return value ?? 0;
  return await computeLiveSupplierOverdueDebt(siblingData.id, req);
};

const aging0to30Hook: FieldHook = async ({ siblingData, req }) => {
  if (!siblingData?.id || !siblingData.currentDebtUSD) return 0;
  const aging = await getSupplierAging(siblingData.id, req);
  return aging.aging0to30;
};

const aging31to60Hook: FieldHook = async ({ siblingData, req }) => {
  if (!siblingData?.id || !siblingData.currentDebtUSD) return 0;
  const aging = await getSupplierAging(siblingData.id, req);
  return aging.aging31to60;
};

const aging60PlusHook: FieldHook = async ({ siblingData, req }) => {
  if (!siblingData?.id || !siblingData.currentDebtUSD) return 0;
  const aging = await getSupplierAging(siblingData.id, req);
  return aging.aging60Plus;
};

const beforeValidateSupplier: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  req,
}) => {
  if (!data) return data;

  // Protect currentDebt totals from direct API manipulation
  if (!req.context?.allowInternalDebtUpdate) {
    if (
      data.currentDebtUSD !== undefined &&
      originalDoc &&
      Number(data.currentDebtUSD) !== Number(originalDoc.currentDebtUSD)
    ) {
      throw new Error(
        'El saldo de deuda del proveedor se calcula automáticamente desde las facturas de compra y pagos. No se permite modificación directa.',
      );
    }
    if (
      data.currentDebtVES !== undefined &&
      originalDoc &&
      Number(data.currentDebtVES) !== Number(originalDoc.currentDebtVES)
    ) {
      throw new Error(
        'El saldo de deuda del proveedor en VES se calcula automáticamente. No se permite modificación directa.',
      );
    }
    if (!originalDoc) {
      data.currentDebtUSD = 0;
      data.currentDebtVES = 0;
    }
  }

  return data;
};

const beforeDeleteSupplier: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const db = getActiveDb(req);

  const invCheck = await db.execute(
    sql`SELECT id FROM purchase_invoices WHERE supplier_id = ${id} AND status != 'voided' LIMIT 1`,
  );
  if (invCheck.rows && invCheck.rows.length > 0) {
    throw new Error('No se puede eliminar un proveedor con facturas de compra activas o pendientes.');
  }

  const payCheck = await db.execute(
    sql`SELECT id FROM supplier_payments WHERE supplier_id = ${id} LIMIT 1`,
  );
  if (payCheck.rows && payCheck.rows.length > 0) {
    throw new Error('No se puede eliminar un proveedor con pagos o egresos históricos registrados.');
  }
};

export const Suppliers: CollectionConfig = {
  slug: 'suppliers',
  labels: {
    singular: 'Proveedor / CxP',
    plural: 'Proveedores / CxP',
  },
  admin: {
    useAsTitle: 'name',
    group: 'Proveedores & CxP',
    defaultColumns: ['name', 'taxId', 'phone', 'creditAllowed', 'currentDebtUSD'],
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
    delete: ({ req: { user } }) =>
      Boolean(user?.role === 'super-admin' || user?.role === 'tenant-admin'),
  },
  hooks: {
    beforeValidate: [beforeValidateSupplier],
    beforeDelete: [beforeDeleteSupplier],
  },
  endpoints: [
    {
      path: '/:id/statement',
      method: 'get',
      handler: async (req) => {
        if (!req.user) {
          return Response.json(
            { error: 'No autenticado: Se requiere iniciar sesión.' },
            { status: 401 },
          );
        }

        const supplierId = req.routeParams?.id;
        if (!supplierId) {
          return Response.json({ error: 'Supplier ID is required' }, { status: 400 });
        }

        const supplier = await req.payload.findByID({
          collection: 'suppliers',
          id: supplierId as string,
          req,
        });

        if (!supplier) {
          return Response.json({ error: 'Supplier not found' }, { status: 404 });
        }

        // Multi-tenant authorization check
        if (req.user.role !== 'super-admin') {
          const userTenants = getUserTenantIds(req.user);
          const supplierTenantId = extractId(supplier.tenant);

          if (
            !supplierTenantId ||
            !userTenants.map(String).includes(String(supplierTenantId))
          ) {
            return Response.json(
              { error: 'Prohibido: No tiene acceso a este inquilino.' },
              { status: 403 },
            );
          }
        }

        const allOpenInvoices = await fetchAllSupplierOpenInvoices(supplierId, req);
        const aging = await getSupplierAging(supplierId, req);

        return Response.json({
          supplier: {
            id: supplier.id,
            name: supplier.name,
            taxId: supplier.taxId,
            contactName: supplier.contactName,
            phone: supplier.phone,
            email: supplier.email,
            currentDebtUSD: supplier.currentDebtUSD,
            currentDebtVES: supplier.currentDebtVES,
            overdueDebtUSD: supplier.overdueDebtUSD,
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
            receptionStatus: inv.receptionStatus,
          })),
        });
      },
    },
  ],
  fields: [
    {
      name: 'name',
      label: 'Razón Social / Nombre Comercial',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'taxId',
      label: 'RIF / Cédula / Identificación Fiscal',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'contactName',
      label: 'Persona de Contacto',
      type: 'text',
    },
    {
      name: 'phone',
      label: 'Teléfono de Contacto',
      type: 'text',
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
      name: 'creditAllowed',
      label: 'Permitir Compras a Crédito',
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
      label: 'Días de Crédito Acordados',
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
    {
      name: 'notes',
      label: 'Observaciones Comerciales',
      type: 'textarea',
    },
  ],
  timestamps: true,
};
