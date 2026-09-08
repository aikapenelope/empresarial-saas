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

  -- Backfill (Devin #58): las facturas históricas no pueden perder su IVA.
  -- Se recalcula el desglose desde las LÍNEAS y el taxRate del catálogo; la
  -- alícuota general usa la configuración del inquilino (16 por defecto).
  -- Nota: los pagos históricos no se retro-ajustan de IGTF (no hay registro
  -- del método de cobro origen en todos los casos).
  UPDATE "invoices" inv SET
    "tax_base_u_s_d" = lt.base,
    "tax_u_s_d" = lt.iva
  FROM (
    SELECT ii."_parent_id" AS inv_id,
           SUM(CASE WHEN p."tax_rate" <> 'exempt' THEN ii."total_u_s_d" ELSE 0 END) AS base,
           SUM(ii."total_u_s_d" * CASE
                 WHEN p."tax_rate" = 'reduced' THEN 0.08
                 WHEN p."tax_rate" = 'general' THEN COALESCE(t."tax_config_general_rate_pct", 16) / 100.0
                 ELSE 0
               END) AS iva
    FROM "invoices_items" ii
    JOIN "invoices" i2 ON i2."id" = ii."_parent_id"
    JOIN "products" p ON p."id" = ii."product_id"
    JOIN "tenants" t ON t."id" = i2."tenant_id"
    GROUP BY ii."_parent_id"
  ) lt
  WHERE inv."id" = lt.inv_id;
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
