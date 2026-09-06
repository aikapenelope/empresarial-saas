import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   -- Red de seguridad de numeración CxP (Devin #25 hallazgo 2): los gaps por
   -- eliminación ya no reciclan números (nextDocumentNumber usa MAX, no COUNT);
   -- el índice compuesto garantiza la invariante en base de datos.
  CREATE UNIQUE INDEX IF NOT EXISTS "purchase_invoices_tenant_number_unique" ON "purchase_invoices" USING btree ("tenant_id", "invoice_number");
  CREATE UNIQUE INDEX IF NOT EXISTS "supplier_payments_tenant_number_unique" ON "supplier_payments" USING btree ("tenant_id", "payment_number");
`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "purchase_invoices_tenant_number_unique";
  DROP INDEX IF EXISTS "supplier_payments_tenant_number_unique";
`)
}
