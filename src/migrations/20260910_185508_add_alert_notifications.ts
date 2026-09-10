import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_alerts_type" ADD VALUE 'overdue_installment';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'notifyAlertsEmail' BEFORE 'createCollectionExport';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'notifyAlertsEmail' BEFORE 'createCollectionExport';
  CREATE TABLE "tenants_email_config_alerts_email_recipients" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"email" varchar NOT NULL
  );
  
  ALTER TABLE "tenants" ADD COLUMN "email_config_alerts_email_enabled" boolean DEFAULT false;
  ALTER TABLE "alerts" ADD COLUMN "notified_at" timestamp(3) with time zone;
  ALTER TABLE "tenants_email_config_alerts_email_recipients" ADD CONSTRAINT "tenants_email_config_alerts_email_recipients_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "tenants_email_config_alerts_email_recipients_order_idx" ON "tenants_email_config_alerts_email_recipients" USING btree ("_order");
  CREATE INDEX "tenants_email_config_alerts_email_recipients_parent_id_idx" ON "tenants_email_config_alerts_email_recipients" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   -- Política de datos del rollback (Devin #80): las filas que usan los
   -- valores nuevos bloquearían el cast a los enums recreados. Se eliminan
   -- ANTES de estrechar los enums: la alerta overdue_installment y los jobs
   -- del digest son datos de la feature que se está revirtiendo.
   DELETE FROM "payload_jobs_log" WHERE "task_slug" = 'notifyAlertsEmail';
   DELETE FROM "payload_jobs" WHERE "task_slug" = 'notifyAlertsEmail';
   DELETE FROM "alerts" WHERE "type" = 'overdue_installment';
   DROP TABLE "tenants_email_config_alerts_email_recipients" CASCADE;
  ALTER TABLE "alerts" ALTER COLUMN "type" SET DATA TYPE text;
  DROP TYPE "public"."enum_alerts_type";
  CREATE TYPE "public"."enum_alerts_type" AS ENUM('low_stock', 'inventory_diff', 'rate_change', 'overdue_invoice', 'vendor_overdue');
  ALTER TABLE "alerts" ALTER COLUMN "type" SET DATA TYPE "public"."enum_alerts_type" USING "type"::"public"."enum_alerts_type";
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'seedIndustryTemplate', 'evaluateAlerts', 'createCollectionExport', 'createCollectionImport');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'seedIndustryTemplate', 'evaluateAlerts', 'createCollectionExport', 'createCollectionImport');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  ALTER TABLE "tenants" DROP COLUMN "email_config_alerts_email_enabled";
  ALTER TABLE "alerts" DROP COLUMN "notified_at";`)
}
