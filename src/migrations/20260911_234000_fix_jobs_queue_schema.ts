import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   -- ─── Sprint R5: reparar el esquema del Jobs Queue (hallazgos S0-1/S7-2) ───
   -- El scheduling de Payload (task.schedule) activa jobs.scheduling + jobs.stats,
   -- lo que añade el campo "meta" a payload_jobs y el global payload_jobs_stats.
   -- NINGUNA migración los creó (drift de snapshot): en una BD construida con
   -- estas migraciones TODO llamada a payload.jobs.queue fallaba con 42703
   -- (columna "meta" inexistente) — el evaluador de alertas Y el onboarding.
   ALTER TABLE "payload_jobs" ADD COLUMN IF NOT EXISTS "meta" jsonb;
   CREATE TABLE IF NOT EXISTS "payload_jobs_stats" (
   \t"id" serial PRIMARY KEY NOT NULL,
   \t"stats" jsonb,
   \t"updated_at" timestamp(3) with time zone,
   \t"created_at" timestamp(3) with time zone
   );
   -- La tarea evaluateAlerts existía en el config y en el snapshot, pero NINGUNA
   -- migración la agregó al enum: payload.jobs.queue({ task: 'evaluateAlerts' })
   -- fallaba con 22P02 y el evaluador nunca pudo encolarse.
   ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'evaluateAlerts' BEFORE 'notifyAlertsEmail';
   ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'evaluateAlerts' BEFORE 'notifyAlertsEmail';
`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   -- PostgreSQL no soporta DROP VALUE en enums: el rollback recrea el tipo.
   -- Política de datos (patrón de add_alert_notifications): las filas que usan el
   -- valor se eliminan ANTES de estrechar el enum.
   DELETE FROM "payload_jobs_log" WHERE "task_slug" = 'evaluateAlerts';
   DELETE FROM "payload_jobs" WHERE "task_slug" = 'evaluateAlerts';
   ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
   DROP TYPE "public"."enum_payload_jobs_log_task_slug";
   CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'seedIndustryTemplate', 'notifyAlertsEmail', 'createCollectionExport', 'createCollectionImport');
   ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
   ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
   DROP TYPE "public"."enum_payload_jobs_task_slug";
   CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'seedIndustryTemplate', 'notifyAlertsEmail', 'createCollectionExport', 'createCollectionImport');
   ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
   DROP TABLE IF EXISTS "payload_jobs_stats" CASCADE;
   ALTER TABLE "payload_jobs" DROP COLUMN IF EXISTS "meta";
`)
}
