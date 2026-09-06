import type {
  CollectionAfterChangeHook,
  CollectionBeforeDeleteHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
  Config,
  Field,
  Plugin,
} from 'payload';
import { sql } from '@payloadcms/db-postgres';
import { extractId, getActiveDb } from '../utilities/inventoryLedger';
import {
  applySaleStockDeduction,
  revertSaleFromInventory,
} from '../utilities/salesLedger';

/**
 * ─── Sales & Inventory Plugin (Sprint 7) ────────────────────────────────────
 *
 * Empaqueta el acoplamiento venta→inventario siguiendo el patrón canónico de
 * plugins de Payload ((options) => (config) => Config), según la constitución
 * del repo (AGENTS.md §2): doble flecha, inyección de campos mapeando la
 * colección y COMPOSICIÓN de hooks sin sobrescribir los existentes.
 *
 * El plugin es dueño de todo el acoplamiento:
 *  1. Inyecta en `invoices` el campo `warehouse` (almacén de despacho) y la
 *     relación `product` dentro de las líneas de detalle.
 *  2. Compone en `invoices` los hooks de publicación/reversión de stock
 *     (afterChange) y el blindaje de borrado con kardex publicado (beforeDelete).
 *  3. Extiende `stock-movements` con el tipo `sale_return` (entrada: exige
 *     almacén destino y prohíbe origen) y la regla de que `invoice` solo se
 *     asocia a `sale_out`/`sale_return`.
 *
 * La lógica de negocio (locks, idempotencia, snapshots de costo) vive en
 * `src/utilities/salesLedger.ts`; este plugin solo hace el cableado declarativo.
 */

export interface SalesInventoryPluginOptions {
  /** Permite desactivar el plugin completo por instalación (SaaS multi-módulo). */
  enabled?: boolean;
  /** Slugs de las colecciones sobre las que opera (overridables). */
  invoicesSlug?: string;
  stockMovementsSlug?: string;
}

/** Publica la descarga al crear/reactivar y la reversión al anular (voided). */
const postSaleStockHook: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
  req,
}) => {
  if (req.context?.skipSaleStockPosting) return doc;

  const previousStatus = previousDoc?.status;
  const currentStatus = doc.status;

  if (previousStatus !== 'voided' && currentStatus === 'voided') {
    await revertSaleFromInventory(doc.id, req);
  } else if (previousStatus === 'voided' && currentStatus !== 'voided') {
    await applySaleStockDeduction(doc.id, req);
  } else if (operation === 'create' && currentStatus !== 'voided' && currentStatus !== 'draft') {
    await applySaleStockDeduction(doc.id, req);
  }

  return doc;
};

/**
 * El Kardex es inmutable y referencia la factura: eliminar una factura con
 * descargas publicadas rompería el ledger. La vía correcta es anular
 * (status voided), lo que revierte el inventario con movimientos `sale_return`.
 */
const blockDeleteWithPostedStockHook: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const db = getActiveDb(req);
  const movementsRes = await db.execute(
    sql`SELECT id FROM stock_movements WHERE invoice_id = ${id} LIMIT 1`,
  );
  if (movementsRes.rows && movementsRes.rows.length > 0) {
    throw new Error(
      'No se puede eliminar una factura con movimientos de inventario publicados (Kardex inmutable). Anúlela con status "voided" para revertir el inventario.',
    );
  }
  return true;
};

/** Topología de `sale_return` y restricción de referencia de factura. */
const saleStockBeforeValidateHook: CollectionBeforeValidateHook = async ({ data }) => {
  if (!data) return data;

  const type = data.movementType as string;

  if (type === 'sale_return') {
    const sourceId = extractId(data.sourceWarehouse);
    const targetId = extractId(data.targetWarehouse);
    if (!targetId) {
      throw new Error('El tipo de movimiento "sale_return" requiere especificar un almacén de destino.');
    }
    if (sourceId) {
      throw new Error(
        'El tipo de movimiento "sale_return" es una entrada y no permite especificar un almacén de origen.',
      );
    }
  }

  const invoiceId = extractId(data.invoice);
  if (invoiceId && type !== 'sale_out' && type !== 'sale_return') {
    throw new Error(
      'El campo "invoice" solo puede asociarse a movimientos de tipo "sale_out" o "sale_return".',
    );
  }

  return data;
};

export const salesInventoryPlugin =
  (options: SalesInventoryPluginOptions = {}): Plugin =>
  (incomingConfig: Config): Config => {
    if (options.enabled === false) {
      return incomingConfig;
    }

    const invoicesSlug = options.invoicesSlug ?? 'invoices';
    const stockMovementsSlug = options.stockMovementsSlug ?? 'stock-movements';

    const collections: CollectionConfig[] = (incomingConfig.collections || []).map(
      (collection) => {
        // ── 1-2. Invoices: campos de despacho + hooks de publicación/reversión ──
        if (collection.slug === invoicesSlug) {
          const dispatchWarehouseField: Field = {
            name: 'warehouse',
            label: 'Almacén de Despacho (Salida de Inventario)',
            type: 'relationship',
            relationTo: 'warehouses',
            index: true,
            admin: {
              description:
                'De dónde sale el inventario de esta factura. Si se omite, se usa el almacén por defecto del inquilino. Solo se aplica al publicar la descarga (Kardex inmutable).',
            },
          };

          const lineProductField: Field = {
            name: 'product',
            label: 'Producto de Catálogo',
            type: 'relationship',
            relationTo: 'products',
            index: true,
            admin: {
              description:
                'Vínculo al catálogo. Las líneas con producto descargan inventario al publicarse (Kardex); las de texto libre sin producto no afectan existencias.',
            },
          };

          const fields: Field[] = (collection.fields || []).map((field) => {
            if (field.type === 'array' && 'name' in field && field.name === 'items') {
              return {
                ...field,
                fields: [...(field.fields || []), lineProductField],
              };
            }
            return field;
          });

          return {
            ...collection,
            fields: [...fields, dispatchWarehouseField],
            hooks: {
              ...(collection.hooks || {}),
              afterChange: [postSaleStockHook, ...(collection.hooks?.afterChange || [])],
              beforeDelete: [
                blockDeleteWithPostedStockHook,
                ...(collection.hooks?.beforeDelete || []),
              ],
            },
          };
        }

        // ── 3. StockMovements: enum `sale_return` + validación de referencia ──
        if (collection.slug === stockMovementsSlug) {
          const fields: Field[] = (collection.fields || []).map((field) => {
            if (field.type === 'select' && 'name' in field && field.name === 'movementType') {
              return {
                ...field,
                options: [
                  ...(field.options || []),
                  { label: 'Devolución de Venta (Reingreso)', value: 'sale_return' },
                ],
              };
            }
            return field;
          });

          return {
            ...collection,
            fields,
            hooks: {
              ...(collection.hooks || {}),
              beforeValidate: [
                saleStockBeforeValidateHook,
                ...(collection.hooks?.beforeValidate || []),
              ],
            },
          };
        }

        return collection;
      },
    );

    return {
      ...incomingConfig,
      collections,
    };
  };
