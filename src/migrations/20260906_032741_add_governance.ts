import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_invoices_installments_status" AS ENUM('pending', 'partially_paid', 'paid');
  CREATE TYPE "public"."enum_inventory_counts_status" AS ENUM('in_progress', 'completed');
  CREATE TYPE "public"."enum_audit_log_operation" AS ENUM('create', 'update', 'delete');
  CREATE TABLE "invoices_installments" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"number" numeric NOT NULL,
  	"due_date" timestamp(3) with time zone NOT NULL,
  	"amount_u_s_d" numeric NOT NULL,
  	"paid_u_s_d" numeric DEFAULT 0,
  	"status" "enum_invoices_installments_status" DEFAULT 'pending' NOT NULL
  );
  
  CREATE TABLE "inventory_counts_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"product_id" integer NOT NULL,
  	"system_qty" numeric NOT NULL,
  	"counted_qty" numeric,
  	"difference" numeric
  );
  
  CREATE TABLE "inventory_counts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"warehouse_id" integer NOT NULL,
  	"status" "enum_inventory_counts_status" DEFAULT 'in_progress' NOT NULL,
  	"notes" varchar,
  	"opened_by_id" integer,
  	"completed_by_id" integer,
  	"completed_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "audit_log" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"actor_id" integer,
  	"actor_role" varchar,
  	"collection" varchar NOT NULL,
  	"doc_id" numeric NOT NULL,
  	"operation" "enum_audit_log_operation" NOT NULL,
  	"diff" jsonb,
  	"snapshot" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "inventory_counts_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "audit_log_id" integer;
  ALTER TABLE "invoices_installments" ADD CONSTRAINT "invoices_installments_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "inventory_counts_items" ADD CONSTRAINT "inventory_counts_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inventory_counts_items" ADD CONSTRAINT "inventory_counts_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."inventory_counts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_opened_by_id_users_id_fk" FOREIGN KEY ("opened_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_completed_by_id_users_id_fk" FOREIGN KEY ("completed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "invoices_installments_order_idx" ON "invoices_installments" USING btree ("_order");
  CREATE INDEX "invoices_installments_parent_id_idx" ON "invoices_installments" USING btree ("_parent_id");
  CREATE INDEX "inventory_counts_items_order_idx" ON "inventory_counts_items" USING btree ("_order");
  CREATE INDEX "inventory_counts_items_parent_id_idx" ON "inventory_counts_items" USING btree ("_parent_id");
  CREATE INDEX "inventory_counts_items_product_idx" ON "inventory_counts_items" USING btree ("product_id");
  CREATE INDEX "inventory_counts_tenant_idx" ON "inventory_counts" USING btree ("tenant_id");
  CREATE INDEX "inventory_counts_warehouse_idx" ON "inventory_counts" USING btree ("warehouse_id");
  CREATE INDEX "inventory_counts_opened_by_idx" ON "inventory_counts" USING btree ("opened_by_id");
  CREATE INDEX "inventory_counts_completed_by_idx" ON "inventory_counts" USING btree ("completed_by_id");
  CREATE INDEX "inventory_counts_updated_at_idx" ON "inventory_counts" USING btree ("updated_at");
  CREATE INDEX "inventory_counts_created_at_idx" ON "inventory_counts" USING btree ("created_at");
  CREATE INDEX "audit_log_tenant_idx" ON "audit_log" USING btree ("tenant_id");
  CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id");
  CREATE INDEX "audit_log_collection_idx" ON "audit_log" USING btree ("collection");
  CREATE INDEX "audit_log_doc_id_idx" ON "audit_log" USING btree ("doc_id");
  CREATE INDEX "audit_log_updated_at_idx" ON "audit_log" USING btree ("updated_at");
  CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_inventory_counts_fk" FOREIGN KEY ("inventory_counts_id") REFERENCES "public"."inventory_counts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_audit_log_fk" FOREIGN KEY ("audit_log_id") REFERENCES "public"."audit_log"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_inventory_counts_id_idx" ON "payload_locked_documents_rels" USING btree ("inventory_counts_id");
  CREATE INDEX "payload_locked_documents_rels_audit_log_id_idx" ON "payload_locked_documents_rels" USING btree ("audit_log_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "invoices_installments" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "inventory_counts_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "inventory_counts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "audit_log" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "invoices_installments" CASCADE;
  DROP TABLE "inventory_counts_items" CASCADE;
  DROP TABLE "inventory_counts" CASCADE;
  DROP TABLE "audit_log" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_inventory_counts_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_audit_log_fk";
  
  DROP INDEX "payload_locked_documents_rels_inventory_counts_id_idx";
  DROP INDEX "payload_locked_documents_rels_audit_log_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "inventory_counts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "audit_log_id";
  DROP TYPE "public"."enum_invoices_installments_status";
  DROP TYPE "public"."enum_inventory_counts_status";
  DROP TYPE "public"."enum_audit_log_operation";`)
}
