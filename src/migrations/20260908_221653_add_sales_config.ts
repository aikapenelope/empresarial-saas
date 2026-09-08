import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_tenants_sales_config_sales_document_default" AS ENUM('nota_entrega', 'factura');
  CREATE TYPE "public"."enum_orders_price_tier_snapshot" AS ENUM('retail', 'wholesale', 'vendor', 'promo');
  CREATE TYPE "public"."enum_orders_status" AS ENUM('draft', 'confirmed', 'invoiced', 'canceled');
  CREATE TYPE "public"."enum_delivery_notes_status" AS ENUM('issued', 'voided');
  CREATE TYPE "public"."enum_alerts_type" AS ENUM('low_stock', 'inventory_diff', 'rate_change', 'overdue_invoice', 'vendor_overdue');
  CREATE TYPE "public"."enum_alerts_severity" AS ENUM('info', 'warning', 'critical');
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'evaluateAlerts' BEFORE 'createCollectionExport';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'evaluateAlerts' BEFORE 'createCollectionExport';
  CREATE TABLE "orders_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"product_id" integer,
  	"sku" varchar,
  	"description" varchar NOT NULL,
  	"quantity" numeric DEFAULT 1 NOT NULL,
  	"unit_price_u_s_d" numeric DEFAULT 0 NOT NULL,
  	"discount_pct" numeric DEFAULT 0,
  	"total_u_s_d" numeric
  );
  
  CREATE TABLE "orders" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"order_number" varchar NOT NULL,
  	"customer_id" integer NOT NULL,
  	"price_tier_snapshot" "enum_orders_price_tier_snapshot",
  	"issue_date" timestamp(3) with time zone,
  	"confirmed_at" timestamp(3) with time zone,
  	"status" "enum_orders_status" DEFAULT 'draft' NOT NULL,
  	"exchange_rate_snapshot" numeric,
  	"total_u_s_d" numeric,
  	"total_v_e_s" numeric,
  	"issued_invoice_id" integer,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "delivery_notes_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"order_item_index" numeric NOT NULL,
  	"product_id" integer,
  	"sku" varchar,
  	"description" varchar NOT NULL,
  	"quantity" numeric NOT NULL,
  	"unit_price_u_s_d" numeric DEFAULT 0 NOT NULL,
  	"discount_pct" numeric DEFAULT 0
  );
  
  CREATE TABLE "delivery_notes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"note_number" varchar NOT NULL,
  	"order_id" integer NOT NULL,
  	"customer_id" integer NOT NULL,
  	"issue_date" timestamp(3) with time zone,
  	"status" "enum_delivery_notes_status" DEFAULT 'issued' NOT NULL,
  	"exchange_rate_snapshot" numeric,
  	"total_u_s_d" numeric,
  	"total_v_e_s" numeric,
  	"invoice_id" integer,
  	"notes" varchar,
  	"share_token" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "alerts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"type" "enum_alerts_type" NOT NULL,
  	"severity" "enum_alerts_severity" DEFAULT 'warning' NOT NULL,
  	"message" varchar NOT NULL,
  	"ref_collection" varchar,
  	"ref_id" numeric DEFAULT 0 NOT NULL,
  	"acknowledged_at" timestamp(3) with time zone,
  	"acknowledged_by_id" integer,
  	"resolved_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_jobs_stats" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"stats" jsonb,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "tenants" ADD COLUMN "sales_config_sales_document_default" "enum_tenants_sales_config_sales_document_default" DEFAULT 'factura' NOT NULL;
  ALTER TABLE "quotes" ADD COLUMN "share_token" varchar;
  ALTER TABLE "payload_jobs" ADD COLUMN "meta" jsonb;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "orders_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "delivery_notes_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "alerts_id" integer;
  ALTER TABLE "orders_items" ADD CONSTRAINT "orders_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders_items" ADD CONSTRAINT "orders_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_issued_invoice_id_invoices_id_fk" FOREIGN KEY ("issued_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "delivery_notes_items" ADD CONSTRAINT "delivery_notes_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "delivery_notes_items" ADD CONSTRAINT "delivery_notes_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."delivery_notes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "alerts" ADD CONSTRAINT "alerts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledged_by_id_users_id_fk" FOREIGN KEY ("acknowledged_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "orders_items_order_idx" ON "orders_items" USING btree ("_order");
  CREATE INDEX "orders_items_parent_id_idx" ON "orders_items" USING btree ("_parent_id");
  CREATE INDEX "orders_items_product_idx" ON "orders_items" USING btree ("product_id");
  CREATE INDEX "orders_tenant_idx" ON "orders" USING btree ("tenant_id");
  CREATE INDEX "orders_order_number_idx" ON "orders" USING btree ("order_number");
  CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id");
  CREATE INDEX "orders_issued_invoice_idx" ON "orders" USING btree ("issued_invoice_id");
  CREATE INDEX "orders_updated_at_idx" ON "orders" USING btree ("updated_at");
  CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");
  CREATE INDEX "delivery_notes_items_order_idx" ON "delivery_notes_items" USING btree ("_order");
  CREATE INDEX "delivery_notes_items_parent_id_idx" ON "delivery_notes_items" USING btree ("_parent_id");
  CREATE INDEX "delivery_notes_items_product_idx" ON "delivery_notes_items" USING btree ("product_id");
  CREATE INDEX "delivery_notes_tenant_idx" ON "delivery_notes" USING btree ("tenant_id");
  CREATE INDEX "delivery_notes_note_number_idx" ON "delivery_notes" USING btree ("note_number");
  CREATE INDEX "delivery_notes_order_idx" ON "delivery_notes" USING btree ("order_id");
  CREATE INDEX "delivery_notes_customer_idx" ON "delivery_notes" USING btree ("customer_id");
  CREATE INDEX "delivery_notes_invoice_idx" ON "delivery_notes" USING btree ("invoice_id");
  CREATE UNIQUE INDEX "delivery_notes_share_token_idx" ON "delivery_notes" USING btree ("share_token");
  CREATE INDEX "delivery_notes_updated_at_idx" ON "delivery_notes" USING btree ("updated_at");
  CREATE INDEX "delivery_notes_created_at_idx" ON "delivery_notes" USING btree ("created_at");
  CREATE INDEX "alerts_tenant_idx" ON "alerts" USING btree ("tenant_id");
  CREATE INDEX "alerts_type_idx" ON "alerts" USING btree ("type");
  CREATE INDEX "alerts_ref_id_idx" ON "alerts" USING btree ("ref_id");
  CREATE INDEX "alerts_acknowledged_by_idx" ON "alerts" USING btree ("acknowledged_by_id");
  CREATE INDEX "alerts_resolved_at_idx" ON "alerts" USING btree ("resolved_at");
  CREATE INDEX "alerts_updated_at_idx" ON "alerts" USING btree ("updated_at");
  CREATE INDEX "alerts_created_at_idx" ON "alerts" USING btree ("created_at");
  CREATE UNIQUE INDEX "tenant_type_refId_idx" ON "alerts" USING btree ("tenant_id","type","ref_id");
  CREATE INDEX "tenant_resolvedAt_idx" ON "alerts" USING btree ("tenant_id","resolved_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_orders_fk" FOREIGN KEY ("orders_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_delivery_notes_fk" FOREIGN KEY ("delivery_notes_id") REFERENCES "public"."delivery_notes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_alerts_fk" FOREIGN KEY ("alerts_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "quotes_share_token_idx" ON "quotes" USING btree ("share_token");
  CREATE INDEX "payload_locked_documents_rels_orders_id_idx" ON "payload_locked_documents_rels" USING btree ("orders_id");
  CREATE INDEX "payload_locked_documents_rels_delivery_notes_id_idx" ON "payload_locked_documents_rels" USING btree ("delivery_notes_id");
  CREATE INDEX "payload_locked_documents_rels_alerts_id_idx" ON "payload_locked_documents_rels" USING btree ("alerts_id");
  ALTER TABLE "users" DROP COLUMN "password";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "orders_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "orders" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "delivery_notes_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "delivery_notes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "alerts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_jobs_stats" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "orders_items" CASCADE;
  DROP TABLE "orders" CASCADE;
  DROP TABLE "delivery_notes_items" CASCADE;
  DROP TABLE "delivery_notes" CASCADE;
  DROP TABLE "alerts" CASCADE;
  DROP TABLE "payload_jobs_stats" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_orders_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_delivery_notes_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_alerts_fk";
  
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'seedIndustryTemplate', 'createCollectionExport', 'createCollectionImport');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'seedIndustryTemplate', 'createCollectionExport', 'createCollectionImport');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "quotes_share_token_idx";
  DROP INDEX "payload_locked_documents_rels_orders_id_idx";
  DROP INDEX "payload_locked_documents_rels_delivery_notes_id_idx";
  DROP INDEX "payload_locked_documents_rels_alerts_id_idx";
  ALTER TABLE "users" ADD COLUMN "password" varchar;
  ALTER TABLE "tenants" DROP COLUMN "sales_config_sales_document_default";
  ALTER TABLE "quotes" DROP COLUMN "share_token";
  ALTER TABLE "payload_jobs" DROP COLUMN "meta";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "orders_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "delivery_notes_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "alerts_id";
  DROP TYPE "public"."enum_tenants_sales_config_sales_document_default";
  DROP TYPE "public"."enum_orders_price_tier_snapshot";
  DROP TYPE "public"."enum_orders_status";
  DROP TYPE "public"."enum_delivery_notes_status";
  DROP TYPE "public"."enum_alerts_type";
  DROP TYPE "public"."enum_alerts_severity";`)
}
