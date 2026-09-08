import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

// Sprint 41: salesConfig.salesDocumentDefault en tenants.
// Migración quirúrgica: el diff completo de drizzle arrastraba enums/tablas
// ya existentes en producción (ruido del drift del cluster local) — se podó
// a las dos sentencias reales del cambio.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_tenants_sales_config_sales_document_default" AS ENUM('nota_entrega', 'factura');
  ALTER TABLE "tenants" ADD COLUMN "sales_config_sales_document_default" "enum_tenants_sales_config_sales_document_default" DEFAULT 'factura' NOT NULL;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "tenants" DROP COLUMN IF EXISTS "sales_config_sales_document_default";
  DROP TYPE IF EXISTS "public"."enum_tenants_sales_config_sales_document_default";
  `)
}
