import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

// Sprint 42: configuración fiscal por inquilino + snapshot IVA en facturas
// + IGTF informativo en cobros. Quirúrgica e idempotente (el diff de drizzle
// salió invertido/ruidoso por el drift del cluster local y el fix del config).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "tax_config_general_rate_pct" numeric DEFAULT 16;
  ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "tax_config_igtf_pct" numeric DEFAULT 3;
  ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "tax_config_apply_igtf_on_fx_payments" boolean DEFAULT true;
  ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "tax_base_u_s_d" numeric DEFAULT 0;
  ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "tax_u_s_d" numeric DEFAULT 0;
  ALTER TABLE "customer_payments" ADD COLUMN IF NOT EXISTS "igtf_u_s_d" numeric DEFAULT 0;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "customer_payments" DROP COLUMN IF EXISTS "igtf_u_s_d";
  ALTER TABLE "invoices" DROP COLUMN IF EXISTS "tax_u_s_d";
  ALTER TABLE "invoices" DROP COLUMN IF EXISTS "tax_base_u_s_d";
  ALTER TABLE "tenants" DROP COLUMN IF EXISTS "tax_config_apply_igtf_on_fx_payments";
  ALTER TABLE "tenants" DROP COLUMN IF EXISTS "tax_config_igtf_pct";
  ALTER TABLE "tenants" DROP COLUMN IF EXISTS "tax_config_general_rate_pct";
  `)
}
