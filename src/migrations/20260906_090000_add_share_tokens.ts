import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Sprint 28: tokens de compartición pública para cotizaciones y remisiones.
// La columna nace NULL (el token se emite perezosamente la primera vez que se
// comparte el documento) y el índice único garantiza que un token sólo pueda
// resolver a un documento; los NULL múltiples son válidos en índices únicos
// de Postgres.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "quotes" ADD COLUMN "share_token" varchar;
  CREATE UNIQUE INDEX IF NOT EXISTS "quotes_share_token_idx" ON "quotes" USING btree ("share_token");
   ALTER TABLE "delivery_notes" ADD COLUMN "share_token" varchar;
  CREATE UNIQUE INDEX IF NOT EXISTS "delivery_notes_share_token_idx" ON "delivery_notes" USING btree ("share_token");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "quotes_share_token_idx";
  ALTER TABLE "quotes" DROP COLUMN IF EXISTS "share_token";
   DROP INDEX IF EXISTS "delivery_notes_share_token_idx";
  ALTER TABLE "delivery_notes" DROP COLUMN IF EXISTS "share_token";`)
}
