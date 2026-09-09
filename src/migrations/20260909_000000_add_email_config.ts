import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

// Sprint 43: auto-envío de presupuestos. La rama se fusionó sin esta
// migración y rompía la creación de inquilinos (columna inexistente).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "email_config_auto_send_quote_email" boolean DEFAULT true;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "tenants" DROP COLUMN IF EXISTS "email_config_auto_send_quote_email";
  `)
}
