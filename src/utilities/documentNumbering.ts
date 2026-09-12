import type { Payload, PayloadRequest } from 'payload';
import { sql } from '@payloadcms/db-postgres';
import { getActiveDb } from './inventoryLedger';

/**
 * ─── Numeración consecutiva de documentos (Sprint R6) ───────────────────────
 *
 * Extraído de `erpActions.ts` (constitución §2.1: la lógica de negocio vive en
 * `utilities/`, no en la capa de Server Actions).
 *
 * Toma un advisory lock transaccional (liberado en commit/rollback) para que dos
 * escrituras concurrentes no elijan el mismo número; debe llamarse SIEMPRE dentro
 * de la transacción del llamador (req requerido). Usa MAX del sufijo numérico —
 * no COUNT — para que los gaps por eliminación no reciclen números ya emitidos;
 * los índices únicos compuestos (tenant, número) son la red de seguridad final.
 */

/** Colecciones numeradas y su tabla/columna física. */
export type DocumentNumberCollection =
  | 'invoices'
  | 'customer-payments'
  | 'production-orders'
  | 'cash-closures'
  | 'quotes'
  | 'orders'
  | 'delivery-notes'
  | 'purchase-invoices'
  | 'supplier-payments';

/**
 * Colecciones numeradas y su tabla/columna física. Exportado como fuente de
 * verdad para que la guarda de esquema (`tests/integration/schemaMirror.test.ts`)
 * verifique los índices únicos (tenant, número) sin duplicar la lista.
 */
export const DOC_NUMBER_TABLES: Record<
  DocumentNumberCollection,
  { table: string; column: string }
> = {
  invoices: { table: 'invoices', column: 'invoice_number' },
  'customer-payments': { table: 'customer_payments', column: 'payment_number' },
  'production-orders': { table: 'production_orders', column: 'order_number' },
  'cash-closures': { table: 'cash_closures', column: 'closure_number' },
  quotes: { table: 'quotes', column: 'quote_number' },
  orders: { table: 'orders', column: 'order_number' },
  'delivery-notes': { table: 'delivery_notes', column: 'note_number' },
  'purchase-invoices': { table: 'purchase_invoices', column: 'invoice_number' },
  'supplier-payments': { table: 'supplier_payments', column: 'payment_number' },
};

export async function nextDocumentNumber(
  payload: Payload,
  collection: DocumentNumberCollection,
  tenantId: number,
  prefix: string,
  req: PayloadRequest,
): Promise<string> {
  const db = getActiveDb(req);
  await db.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`docnum:${collection}:${tenantId}`}))`,
  );

  const { table, column } = DOC_NUMBER_TABLES[collection];
  // Solo se consideran identificadores con el formato generado por el sistema
  // (`prefijo-<solo dígitos>`): valores manuales o históricos con otro formato
  // se ignoran en la secuencia y no pueden romper el CAST del sufijo.
  const maxRes = await db.execute(
    sql`SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(${sql.raw(column)}, '^.*-', '') AS integer)), 0) AS max_num
        FROM ${sql.raw(table)}
        WHERE tenant_id = ${tenantId}
          AND ${sql.raw(column)} ~ ('^' || ${prefix} || '-[0-9]+$')`,
  );
  const maxNum = Number(maxRes.rows?.[0]?.max_num) || 0;

  return `${prefix}-${String(maxNum + 1).padStart(5, '0')}`;
}
