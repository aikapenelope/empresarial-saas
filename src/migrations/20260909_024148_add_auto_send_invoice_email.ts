import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

// Sprint 43.3: auto-envío de facturas por email al emitirlas.
// Quirúrgica e idempotente: el diff de drizzle arrastraba columnas ya migradas
// (emailConfig del S43.1 y share_token del S43.2) — aquí solo lo nuevo.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "email_config_auto_send_invoice_email" boolean DEFAULT false;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "tenants" DROP COLUMN IF EXISTS "email_config_auto_send_invoice_email";
  `)
}
