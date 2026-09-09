import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

// Sprint 43.2: facturas compartibles por token público (email/WhatsApp).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "share_token" varchar;
  CREATE UNIQUE INDEX IF NOT EXISTS "invoices_share_token_idx" ON "invoices" ("share_token");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "invoices_share_token_idx";
  ALTER TABLE "invoices" DROP COLUMN IF EXISTS "share_token";
  `)
}
