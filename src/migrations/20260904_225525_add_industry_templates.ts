import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_industry_templates_default_payment_methods" AS ENUM('cash_usd', 'cash_ves', 'pos_ves', 'pago_movil', 'transfer_ves', 'zelle', 'binance');
  CREATE TYPE "public"."enum_industry_templates_industry_type" AS ENUM('food_production', 'retail_health', 'wholesale', 'services');
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'seedIndustryTemplate');
  CREATE TYPE "public"."enum_payload_jobs_log_state" AS ENUM('failed', 'succeeded');
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'seedIndustryTemplate');
  CREATE TABLE "industry_templates_default_payment_methods" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_industry_templates_default_payment_methods",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "industry_templates" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar NOT NULL,
  	"industry_type" "enum_industry_templates_industry_type" NOT NULL,
  	"icon" varchar DEFAULT 'Sparkles',
  	"is_published" boolean DEFAULT true,
  	"template_data" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_jobs_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"executed_at" timestamp(3) with time zone NOT NULL,
  	"completed_at" timestamp(3) with time zone NOT NULL,
  	"task_slug" "enum_payload_jobs_log_task_slug" NOT NULL,
  	"task_i_d" varchar NOT NULL,
  	"input" jsonb,
  	"output" jsonb,
  	"state" "enum_payload_jobs_log_state" NOT NULL,
  	"error" jsonb
  );
  
  CREATE TABLE "payload_jobs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"input" jsonb,
  	"completed_at" timestamp(3) with time zone,
  	"total_tried" numeric DEFAULT 0,
  	"has_error" boolean DEFAULT false,
  	"error" jsonb,
  	"task_slug" "enum_payload_jobs_task_slug",
  	"queue" varchar DEFAULT 'default',
  	"wait_until" timestamp(3) with time zone,
  	"processing" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "industry_templates_id" integer;
  ALTER TABLE "industry_templates_default_payment_methods" ADD CONSTRAINT "industry_templates_default_payment_methods_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."industry_templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_jobs_log" ADD CONSTRAINT "payload_jobs_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payload_jobs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "industry_templates_default_payment_methods_order_idx" ON "industry_templates_default_payment_methods" USING btree ("order");
  CREATE INDEX "industry_templates_default_payment_methods_parent_idx" ON "industry_templates_default_payment_methods" USING btree ("parent_id");
  CREATE INDEX "industry_templates_name_idx" ON "industry_templates" USING btree ("name");
  CREATE UNIQUE INDEX "industry_templates_slug_idx" ON "industry_templates" USING btree ("slug");
  CREATE INDEX "industry_templates_updated_at_idx" ON "industry_templates" USING btree ("updated_at");
  CREATE INDEX "industry_templates_created_at_idx" ON "industry_templates" USING btree ("created_at");
  CREATE INDEX "payload_jobs_log_order_idx" ON "payload_jobs_log" USING btree ("_order");
  CREATE INDEX "payload_jobs_log_parent_id_idx" ON "payload_jobs_log" USING btree ("_parent_id");
  CREATE INDEX "payload_jobs_completed_at_idx" ON "payload_jobs" USING btree ("completed_at");
  CREATE INDEX "payload_jobs_total_tried_idx" ON "payload_jobs" USING btree ("total_tried");
  CREATE INDEX "payload_jobs_has_error_idx" ON "payload_jobs" USING btree ("has_error");
  CREATE INDEX "payload_jobs_task_slug_idx" ON "payload_jobs" USING btree ("task_slug");
  CREATE INDEX "payload_jobs_queue_idx" ON "payload_jobs" USING btree ("queue");
  CREATE INDEX "payload_jobs_wait_until_idx" ON "payload_jobs" USING btree ("wait_until");
  CREATE INDEX "payload_jobs_processing_idx" ON "payload_jobs" USING btree ("processing");
  CREATE INDEX "payload_jobs_updated_at_idx" ON "payload_jobs" USING btree ("updated_at");
  CREATE INDEX "payload_jobs_created_at_idx" ON "payload_jobs" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_industry_templates_fk" FOREIGN KEY ("industry_templates_id") REFERENCES "public"."industry_templates"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_industry_templates_id_idx" ON "payload_locked_documents_rels" USING btree ("industry_templates_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_industry_templates_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_industry_templates_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "industry_templates_id";
  ALTER TABLE "industry_templates_default_payment_methods" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "industry_templates" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_jobs_log" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_jobs" DISABLE ROW LEVEL SECURITY;
  DROP TABLE IF EXISTS "industry_templates_default_payment_methods" CASCADE;
  DROP TABLE IF EXISTS "industry_templates" CASCADE;
  DROP TABLE IF EXISTS "payload_jobs_log" CASCADE;
  DROP TABLE IF EXISTS "payload_jobs" CASCADE;
  DROP TYPE IF EXISTS "public"."enum_industry_templates_default_payment_methods";
  DROP TYPE IF EXISTS "public"."enum_industry_templates_industry_type";
  DROP TYPE IF EXISTS "public"."enum_payload_jobs_log_task_slug";
  DROP TYPE IF EXISTS "public"."enum_payload_jobs_log_state";
  DROP TYPE IF EXISTS "public"."enum_payload_jobs_task_slug";`)
}
