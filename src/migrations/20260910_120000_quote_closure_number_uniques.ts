import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   -- Completa la red de seguridad de numeración (Sprint R1 · auditoría
   -- 2026-09-10 · P1-S2-01): quotes y cash_closures eran las 2 únicas
   -- colecciones numeradas de 9 sin índice único compuesto (tenant, número).
   -- Igual que las 7 hermanas (document_number_uniques, cxp_number_uniques,
   -- add_orders, add_delivery_notes), el correlativo COT/CAJA ya se serializa
   -- con pg_advisory_xact_lock en nextDocumentNumber; este índice solo
   -- materializa en BD la invariante que el código ya garantiza.
  CREATE UNIQUE INDEX IF NOT EXISTS "quotes_tenant_quote_number_unique" ON "quotes" USING btree ("tenant_id", "quote_number");
  CREATE UNIQUE INDEX IF NOT EXISTS "cash_closures_tenant_closure_number_unique" ON "cash_closures" USING btree ("tenant_id", "closure_number");
`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "quotes_tenant_quote_number_unique";
  DROP INDEX IF EXISTS "cash_closures_tenant_closure_number_unique";
`)
}
