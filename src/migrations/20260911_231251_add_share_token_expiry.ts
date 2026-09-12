import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "invoices" ADD COLUMN "share_token_expires_at" timestamp(3) with time zone;
  ALTER TABLE "quotes" ADD COLUMN "share_token_expires_at" timestamp(3) with time zone;
  ALTER TABLE "delivery_notes" ADD COLUMN "share_token_expires_at" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "invoices" DROP COLUMN "share_token_expires_at";
  ALTER TABLE "quotes" DROP COLUMN "share_token_expires_at";
  ALTER TABLE "delivery_notes" DROP COLUMN "share_token_expires_at";`)
}
