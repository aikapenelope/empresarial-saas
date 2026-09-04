import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload';
import { extractId, getUserTenantIds, resolveTenantId } from '../../utilities/inventoryLedger';

const beforeValidateCategory: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  req,
}) => {
  if (!data) return data;

  const parentId = extractId(data.parentCategory ?? originalDoc?.parentCategory);

  // Determine effective tenant
  let effectiveTenant = resolveTenantId(data, originalDoc, req);

  // If user is not super-admin and no tenant specified, resolve from user
  if (!effectiveTenant && req.user && req.user.role !== 'super-admin') {
    const userTenants = getUserTenantIds(req.user);
    if (userTenants.length > 0) {
      effectiveTenant = userTenants[0];
      if (!data.tenant) {
        data.tenant = effectiveTenant as number;
      }
    }
  }

  // If user is not super-admin, enforce caller tenant access
  if (effectiveTenant && req.user && req.user.role !== 'super-admin') {
    const userTenants = getUserTenantIds(req.user);
    if (!userTenants.map(String).includes(String(effectiveTenant))) {
      throw new Error('Prohibido: No tiene acceso a este inquilino.');
    }
  }

  if (effectiveTenant && parentId) {
    const parent = await req.payload.findByID({
      collection: 'categories',
      id: parentId,
      depth: 0,
      req,
    });
    const parentTenant = extractId(parent?.tenant);
    if (parentTenant && String(effectiveTenant) !== String(parentTenant)) {
      throw new Error(
        'Violación de multi-inquilino: La categoría padre pertenece a otro inquilino.',
      );
    }
  }

  return data;
};

export const Categories: CollectionConfig = {
  slug: 'categories',
  labels: {
    singular: 'Categoría',
    plural: 'Categorías',
  },
  admin: {
    useAsTitle: 'name',
    group: 'Inventario & Producción',
    defaultColumns: ['name', 'code', 'isActive'],
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
    beforeValidate: [beforeValidateCategory],
  },
  fields: [
    {
      name: 'name',
      label: 'Nombre de la Categoría',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'code',
      label: 'Código / Clave',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'description',
      label: 'Descripción',
      type: 'textarea',
    },
    {
      name: 'parentCategory',
      label: 'Categoría Superior / Padre',
      type: 'relationship',
      relationTo: 'categories',
      filterOptions: ({ id }) => {
        if (!id) return true;
        return {
          id: {
            not_equals: id,
          },
        };
      },
    },
    {
      name: 'isActive',
      label: 'Activa',
      type: 'checkbox',
      defaultValue: true,
    },
  ],
  timestamps: true,
};
