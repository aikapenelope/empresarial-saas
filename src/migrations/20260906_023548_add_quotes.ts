import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_quotes_status" AS ENUM('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted');
  CREATE TYPE "public"."enum_exports_format" AS ENUM('csv', 'json');
  CREATE TYPE "public"."enum_exports_sort_order" AS ENUM('asc', 'desc');
  CREATE TYPE "public"."enum_exports_drafts" AS ENUM('yes', 'no');
  CREATE TYPE "public"."enum_imports_import_mode" AS ENUM('create', 'update', 'upsert');
  CREATE TYPE "public"."enum_imports_status" AS ENUM('pending', 'completed', 'partial', 'failed');
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'createCollectionExport';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'createCollectionImport';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'createCollectionExport';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'createCollectionImport';
  CREATE TABLE "quotes_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"product_id" integer,
  	"sku" varchar,
  	"description" varchar NOT NULL,
  	"quantity" numeric DEFAULT 1 NOT NULL,
  	"unit_price_u_s_d" numeric DEFAULT 0 NOT NULL,
  	"total_u_s_d" numeric
  );
  
  CREATE TABLE "quotes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"quote_number" varchar NOT NULL,
  	"customer_id" integer NOT NULL,
  	"issue_date" timestamp(3) with time zone,
  	"valid_until" timestamp(3) with time zone,
  	"status" "enum_quotes_status" DEFAULT 'draft' NOT NULL,
  	"exchange_rate_snapshot" numeric,
  	"total_u_s_d" numeric,
  	"total_v_e_s" numeric,
  	"converted_invoice_id" integer,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "exports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"format" "enum_exports_format" DEFAULT 'csv' NOT NULL,
  	"limit" numeric,
  	"page" numeric DEFAULT 1,
  	"sort" varchar,
  	"sort_order" "enum_exports_sort_order",
  	"drafts" "enum_exports_drafts" DEFAULT 'yes',
  	"collection_slug" varchar DEFAULT 'products' NOT NULL,
  	"where" jsonb DEFAULT '{}'::jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "exports_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "imports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"collection_slug" varchar DEFAULT 'products' NOT NULL,
  	"import_mode" "enum_imports_import_mode",
  	"match_field" varchar DEFAULT 'id',
  	"status" "enum_imports_status" DEFAULT 'pending',
  	"summary_imported" numeric,
  	"summary_updated" numeric,
  	"summary_total" numeric,
  	"summary_issues" numeric,
  	"summary_issue_details" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  ALTER TABLE "stock_movements" ALTER COLUMN "movement_type" SET DATA TYPE text;
  DROP TYPE "public"."enum_stock_movements_movement_type";
  CREATE TYPE "public"."enum_stock_movements_movement_type" AS ENUM('purchase_in', 'sale_out', 'production_consume', 'production_output', 'transfer', 'adjustment_positive', 'adjustment_negative', 'scrap', 'sale_return');
  ALTER TABLE "stock_movements" ALTER COLUMN "movement_type" SET DATA TYPE "public"."enum_stock_movements_movement_type" USING "movement_type"::"public"."enum_stock_movements_movement_type";
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "quotes_id" integer;
  ALTER TABLE "quotes_items" ADD CONSTRAINT "quotes_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quotes_items" ADD CONSTRAINT "quotes_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "quotes" ADD CONSTRAINT "quotes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quotes" ADD CONSTRAINT "quotes_converted_invoice_id_invoices_id_fk" FOREIGN KEY ("converted_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "exports_texts" ADD CONSTRAINT "exports_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."exports"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "quotes_items_order_idx" ON "quotes_items" USING btree ("_order");
  CREATE INDEX "quotes_items_parent_id_idx" ON "quotes_items" USING btree ("_parent_id");
  CREATE INDEX "quotes_items_product_idx" ON "quotes_items" USING btree ("product_id");
  CREATE INDEX "quotes_tenant_idx" ON "quotes" USING btree ("tenant_id");
  CREATE INDEX "quotes_quote_number_idx" ON "quotes" USING btree ("quote_number");
  CREATE INDEX "quotes_customer_idx" ON "quotes" USING btree ("customer_id");
  CREATE INDEX "quotes_converted_invoice_idx" ON "quotes" USING btree ("converted_invoice_id");
  CREATE INDEX "quotes_updated_at_idx" ON "quotes" USING btree ("updated_at");
  CREATE INDEX "quotes_created_at_idx" ON "quotes" USING btree ("created_at");
  CREATE INDEX "exports_updated_at_idx" ON "exports" USING btree ("updated_at");
  CREATE INDEX "exports_created_at_idx" ON "exports" USING btree ("created_at");
  CREATE UNIQUE INDEX "exports_filename_idx" ON "exports" USING btree ("filename");
  CREATE INDEX "exports_texts_order_parent" ON "exports_texts" USING btree ("order","parent_id");
  CREATE INDEX "imports_updated_at_idx" ON "imports" USING btree ("updated_at");
  CREATE INDEX "imports_created_at_idx" ON "imports" USING btree ("created_at");
  CREATE UNIQUE INDEX "imports_filename_idx" ON "imports" USING btree ("filename");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_quotes_fk" FOREIGN KEY ("quotes_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_quotes_id_idx" ON "payload_locked_documents_rels" USING btree ("quotes_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "quotes_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "quotes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "exports" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "exports_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "imports" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "quotes_items" CASCADE;
  DROP TABLE "quotes" CASCADE;
  DROP TABLE "exports" CASCADE;
  DROP TABLE "exports_texts" CASCADE;
  DROP TABLE "imports" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_quotes_fk";
  
  ALTER TABLE "stock_movements" ALTER COLUMN "movement_type" SET DATA TYPE text;
  DROP TYPE "public"."enum_stock_movements_movement_type";
  CREATE TYPE "public"."enum_stock_movements_movement_type" AS ENUM('purchase_in', 'sale_out', 'sale_return', 'production_consume', 'production_output', 'transfer', 'adjustment_positive', 'adjustment_negative', 'scrap');
  ALTER TABLE "stock_movements" ALTER COLUMN "movement_type" SET DATA TYPE "public"."enum_stock_movements_movement_type" USING "movement_type"::"public"."enum_stock_movements_movement_type";
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'seedIndustryTemplate');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'seedIndustryTemplate');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "payload_locked_documents_rels_quotes_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "quotes_id";
  DROP TYPE "public"."enum_quotes_status";
  DROP TYPE "public"."enum_exports_format";
  DROP TYPE "public"."enum_exports_sort_order";
  DROP TYPE "public"."enum_exports_drafts";
  DROP TYPE "public"."enum_imports_import_mode";
  DROP TYPE "public"."enum_imports_status";`)
}
