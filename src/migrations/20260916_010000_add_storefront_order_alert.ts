import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_alerts_type" ADD VALUE IF NOT EXISTS 'storefront_order';
  `);
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Postgres no permite eliminar valores individuales de un enum nativo sin recrear el tipo.
  // Se mantiene no-op para asegurar la compatibilidad e integridad de datos existentes.
}
