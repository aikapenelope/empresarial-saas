import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// El scaffold original declaró un campo `password` manual (type: text) en la colección
// users, que la migración add_finance_crm materializó como columna. Las colecciones
// auth de Payload gestionan las credenciales nativamente (salt/hash) y el campo nunca
// almacenó nada útil: esta limpieza elimina la columna huérfana para alinear el esquema
// con lo que produce el template oficial de Payload.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "users" DROP COLUMN IF EXISTS "password";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "users" ADD COLUMN "password" varchar;`)
}
