import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   -- Red de seguridad de numeración de documentos de negocio: el número es único
   -- POR INQUILINO (los correlativos FAC/RC/ORD-FAB se reinician por empresa).
   -- La colisión concurrente ya se previene con pg_advisory_xact_lock en
   -- nextDocumentNumber; el índice compuesto garantiza la invariante en BD.
  CREATE UNIQUE INDEX IF NOT EXISTS "invoices_tenant_number_unique" ON "invoices" USING btree ("tenant_id", "invoice_number");
  CREATE UNIQUE INDEX IF NOT EXISTS "customer_payments_tenant_number_unique" ON "customer_payments" USING btree ("tenant_id", "payment_number");
  CREATE UNIQUE INDEX IF NOT EXISTS "production_orders_tenant_number_unique" ON "production_orders" USING btree ("tenant_id", "order_number");
`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "invoices_tenant_number_unique";
  DROP INDEX IF EXISTS "customer_payments_tenant_number_unique";
  DROP INDEX IF EXISTS "production_orders_tenant_number_unique";
`)
}
