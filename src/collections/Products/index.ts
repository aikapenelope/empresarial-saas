import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload';
import {
  extractId,
  getActiveDb,
  getUserTenantIds,
  resolveTenantId,
} from '../../utilities/inventoryLedger';
import { sql } from '@payloadcms/db-postgres';

const beforeValidateProduct: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  operation,
  req,
}) => {
  if (!data) return data;

  // Enforce currentStock immutability outside internal ledger recalculation
  const isInternalStockUpdate = Boolean(req.context?.allowInternalStockUpdate);

  if (!isInternalStockUpdate) {
    if (operation === 'create') {
      if (data.currentStock !== undefined && Number(data.currentStock) !== 0) {
        throw new Error(
          'El campo "currentStock" es inmutable y no puede asignarse manualmente al crear el producto. Registre una entrada de inventario.',
        );
      }
      data.currentStock = 0;
    } else if (operation === 'update' && data.currentStock !== undefined) {
      if (
        originalDoc &&
        Number(data.currentStock) !== Number(originalDoc.currentStock)
      ) {
        throw new Error(
          'El campo "currentStock" es inmutable y solo puede modificarse mediante movimientos de inventario en el Kardex.',
        );
      }
      delete data.currentStock;
    }
  }

  const categoryId = extractId(data.category ?? originalDoc?.category);

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

  if (effectiveTenant && categoryId) {
    const category = await req.payload.findByID({
      collection: 'categories',
      id: categoryId,
      depth: 0,
      req,
    });
    const categoryTenant = extractId(category?.tenant);
    if (categoryTenant && String(effectiveTenant) !== String(categoryTenant)) {
      throw new Error(
        'Violación de multi-inquilino: La categoría seleccionada pertenece a otro inquilino.',
      );
    }
  }

  return data;
};

export const Products: CollectionConfig = {
  slug: 'products',
  labels: {
    singular: 'Producto / Artículo',
    plural: 'Productos / Artículos',
  },
  admin: {
    useAsTitle: 'name',
    group: 'Inventario & Producción',
    defaultColumns: [
      'name',
      'sku',
      'productType',
      'currentStock',
      'unitOfMeasure',
      'costUSD',
      'priceUSD',
      'isActive',
    ],
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
    beforeValidate: [beforeValidateProduct],
  },
  endpoints: [
    {
      path: '/:id/warehouse-stock',
      method: 'get',
      handler: async (req) => {
        if (!req.user) {
          return Response.json(
            { error: 'No autenticado: Se requiere iniciar sesión.' },
            { status: 401 },
          );
        }

        const productId = req.routeParams?.id;
        if (!productId) {
          return Response.json({ error: 'Product ID is required' }, { status: 400 });
        }

        const product = await req.payload.findByID({
          collection: 'products',
          id: productId as string,
          depth: 0,
          req,
        });

        if (!product) {
          return Response.json({ error: 'Producto no encontrado' }, { status: 404 });
        }

        // Enforce multi-tenant authorization
        if (req.user.role !== 'super-admin') {
          const userTenants = (
            (req.user as unknown as { tenants?: Array<{ tenant: number | { id: number } }> })
              ?.tenants || []
          ).map((t) =>
            typeof t.tenant === 'object' && t.tenant !== null ? t.tenant.id : t.tenant,
          );
          const productTenantId = extractId(product.tenant);

          if (!productTenantId || !userTenants.includes(productTenantId as number)) {
            return Response.json(
              { error: 'Prohibido: No tiene acceso a este inquilino.' },
              { status: 403 },
            );
          }
        }

        const db = getActiveDb(req);
        const stockResult = await db.execute(
          sql`
            SELECT 
              w.id AS warehouse_id,
              w.name AS warehouse_name,
              w.code AS warehouse_code,
              w.type AS warehouse_type,
              COALESCE(
                SUM(CASE WHEN sm.target_warehouse_id = w.id THEN sm.quantity ELSE 0 END) - 
                SUM(CASE WHEN sm.source_warehouse_id = w.id THEN sm.quantity ELSE 0 END), 
                0
              ) AS stock
            FROM warehouses w
            LEFT JOIN stock_movements sm ON (
              (sm.target_warehouse_id = w.id OR sm.source_warehouse_id = w.id) 
              AND sm.product_id = ${productId}
            )
            WHERE w.tenant_id = ${extractId(product.tenant)}
              AND w.is_active = true
            GROUP BY w.id, w.name, w.code, w.type
            ORDER BY w.name ASC
          `,
        );

        return Response.json({
          product: {
            id: product.id,
            name: product.name,
            sku: product.sku,
            currentStock: product.currentStock,
            unitOfMeasure: product.unitOfMeasure,
          },
          warehouses: (stockResult.rows || []).map((row) => ({
            warehouseId: row.warehouse_id,
            warehouseName: row.warehouse_name,
            warehouseCode: row.warehouse_code,
            warehouseType: row.warehouse_type,
            stock: Number(Number(row.stock || 0).toFixed(4)),
          })),
        });
      },
    },
  ],
  fields: [
    {
      name: 'name',
      label: 'Nombre del Producto o Insumo',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'sku',
      label: 'Código SKU',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'barcode',
      label: 'Código de Barras / GTIN',
      type: 'text',
      index: true,
    },
    {
      name: 'productType',
      label: 'Tipo de Artículo',
      type: 'select',
      required: true,
      defaultValue: 'standard',
      options: [
        { label: 'Estándar / Reventa', value: 'standard' },
        { label: 'Materia Prima / Insumo', value: 'raw_material' },
        { label: 'Manufacturado / Fabricado', value: 'manufactured' },
        { label: 'Servicio / No Tangible', value: 'service' },
      ],
    },
    {
      name: 'category',
      label: 'Categoría',
      type: 'relationship',
      relationTo: 'categories',
      index: true,
    },
    {
      name: 'unitOfMeasure',
      label: 'Unidad de Medida',
      type: 'select',
      required: true,
      defaultValue: 'unit',
      options: [
        { label: 'Unidad (und)', value: 'unit' },
        { label: 'Kilogramo (kg)', value: 'kg' },
        { label: 'Gramo (g)', value: 'g' },
        { label: 'Litro (L)', value: 'l' },
        { label: 'Mililitro (ml)', value: 'ml' },
        { label: 'Metro (m)', value: 'm' },
        { label: 'Caja / Paquete (box)', value: 'box' },
      ],
    },
    // Costing and Pricing
    {
      name: 'costUSD',
      label: 'Costo Promedio Ponderado (USD)',
      type: 'number',
      required: true,
      defaultValue: 0,
      min: 0,
    },
    {
      name: 'priceUSD',
      label: 'Precio Base de Venta (USD)',
      type: 'number',
      required: true,
      defaultValue: 0,
      min: 0,
    },
    {
      name: 'taxRate',
      label: 'Tratamiento Impositivo (IVA)',
      type: 'select',
      required: true,
      defaultValue: 'exempt',
      options: [
        { label: 'Exento (0%)', value: 'exempt' },
        { label: 'General (16%)', value: 'general' },
        { label: 'Reducido (8%)', value: 'reduced' },
      ],
    },
    // Inventory Tracking
    {
      name: 'trackInventory',
      label: 'Controlar Existencias / Kardex',
      type: 'checkbox',
      defaultValue: true,
    },
    {
      name: 'minStockAlert',
      label: 'Stock Mínimo (Alerta de Reposición)',
      type: 'number',
      defaultValue: 0,
      min: 0,
    },
    {
      name: 'maxStock',
      label: 'Stock Máximo Sugerido',
      type: 'number',
      min: 0,
    },
    {
      name: 'currentStock',
      label: 'Existencia Total en Almacenes',
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
      name: 'description',
      label: 'Descripción Comercial / Ficha Técnica',
      type: 'textarea',
    },
    {
      name: 'image',
      label: 'Foto o Imagen del Producto',
      type: 'upload',
      relationTo: 'media',
      custom: {
        'plugin-import-export': {
          disabled: true,
        },
      },
    },
    {
      name: 'isActive',
      label: 'Activo para Operaciones',
      type: 'checkbox',
      defaultValue: true,
    },
  ],
  timestamps: true,
};
