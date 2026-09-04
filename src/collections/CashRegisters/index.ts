import type {
  CollectionBeforeDeleteHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
} from 'payload';
import { extractId } from '../../utilities/cashLedger';

const beforeValidateCashRegister: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  operation,
  req,
}) => {
  if (!data) return data;

  if (data.code) {
    data.code = String(data.code).trim().toUpperCase();
  }

  const tenantId = extractId(data.tenant || originalDoc?.tenant);
  const docId = originalDoc?.id;

  // 1. Validar unicidad del código de caja dentro del tenant
  if (data.code && tenantId) {
    const existing = await req.payload.find({
      collection: 'cash-registers',
      where: {
        and: [
          { code: { equals: data.code } },
          { tenant: { equals: tenantId } },
          ...(docId ? [{ id: { not_equals: docId } }] : []),
        ],
      },
      limit: 1,
      depth: 0,
      req,
    });

    if (existing.totalDocs > 0) {
      throw new Error(
        `Ya existe una caja registradora con el código "${data.code}" en esta empresa.`,
      );
    }
  }

  // 2. Validar que el almacén/sucursal exista y pertenezca al mismo tenant
  const warehouseId = extractId(data.warehouse);
  if (warehouseId && tenantId) {
    const warehouse = await req.payload.findByID({
      collection: 'warehouses',
      id: warehouseId,
      depth: 0,
      req,
    });

    if (!warehouse) {
      throw new Error(`El almacén asignado con ID ${warehouseId} no existe.`);
    }

    const warehouseTenantId = extractId(warehouse.tenant);
    if (warehouseTenantId && String(warehouseTenantId) !== String(tenantId)) {
      throw new Error('El almacén seleccionado pertenece a otra empresa.');
    }
  }

  // 3. Proteger la manipulación directa del estado operativo
  if (!req.context?.skipStatusValidation && operation === 'update') {
    if (
      data.currentStatus !== undefined &&
      originalDoc &&
      data.currentStatus !== originalDoc.currentStatus
    ) {
      throw new Error(
        'El estado operativo de la caja (abierta/cerrada) se actualiza automáticamente al abrir o cerrar turnos en Cierres de Caja.',
      );
    }
  }

  return data;
};

const beforeDeleteCashRegister: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const closures = await req.payload.find({
    collection: 'cash-closures',
    where: {
      cashRegister: { equals: id },
    },
    limit: 1,
    depth: 0,
    req,
  });

  if (closures.totalDocs > 0) {
    throw new Error(
      'No se puede eliminar una caja registradora con historial operativo de turnos y arqueos. Puede desactivarla para prevenir nuevos turnos.',
    );
  }
};

export const CashRegisters: CollectionConfig = {
  slug: 'cash-registers',
  labels: {
    singular: 'Caja Registradora',
    plural: 'Cajas Registradoras (Puntos de Cobro)',
  },
  admin: {
    useAsTitle: 'name',
    group: 'Caja & Puntos de Venta',
    defaultColumns: ['name', 'code', 'warehouse', 'assignedUsers', 'currentStatus', 'active'],
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
    beforeValidate: [beforeValidateCashRegister],
    beforeDelete: [beforeDeleteCashRegister],
  },
  fields: [
    {
      name: 'name',
      label: 'Nombre de la Caja / Punto de Cobro',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'code',
      label: 'Código Único de Caja (ej. CAJA-01, POS-02)',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'warehouse',
      label: 'Sucursal / Almacén Asignado',
      type: 'relationship',
      relationTo: 'warehouses',
      required: true,
      index: true,
    },
    {
      name: 'assignedUsers',
      label: 'Cajeros / Operadores Autorizados',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      index: true,
    },
    {
      name: 'currentStatus',
      label: 'Estado Operativo Actual',
      type: 'select',
      defaultValue: 'closed',
      required: true,
      options: [
        { label: 'Caja Abierta (Turno Activo)', value: 'open' },
        { label: 'Caja Cerrada', value: 'closed' },
      ],
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'currentClosure',
      label: 'Turno Activo en Curso',
      type: 'relationship',
      relationTo: 'cash-closures',
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'active',
      label: 'Caja Habilitada para Operaciones',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'notes',
      label: 'Ubicación Física / Equipo / Observaciones',
      type: 'textarea',
    },
  ],
  timestamps: true,
};
