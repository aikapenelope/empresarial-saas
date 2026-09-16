import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_quotes_origin" AS ENUM('manual', 'storefront');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "origin" "public"."enum_quotes_origin" DEFAULT 'manual';
    CREATE INDEX IF NOT EXISTS "quotes_origin_idx" ON "quotes" ("origin");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "quotes_origin_idx";
    ALTER TABLE "quotes" DROP COLUMN IF EXISTS "origin";
    DROP TYPE IF EXISTS "public"."enum_quotes_origin";
  `);
}
