import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_customers_price_tier" AS ENUM('retail', 'wholesale', 'vendor', 'promo');
  CREATE TYPE "public"."enum_products_price_tiers_tier" AS ENUM('wholesale', 'vendor', 'promo');
  CREATE TYPE "public"."enum_price_history_trigger" AS ENUM('manual', 'rate_change');
  ALTER TYPE "public"."enum_users_role" ADD VALUE 'vendor' BEFORE 'cashier';
  CREATE TABLE "products_price_tiers" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tier" "enum_products_price_tiers_tier" NOT NULL,
  	"price_u_s_d" numeric NOT NULL
  );
  
  CREATE TABLE "price_history" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"product_id" integer NOT NULL,
  	"old_price_u_s_d" numeric NOT NULL,
  	"new_price_u_s_d" numeric NOT NULL,
  	"exchange_rate_snapshot" numeric NOT NULL,
  	"new_price_v_e_s" numeric NOT NULL,
  	"trigger" "enum_price_history_trigger" DEFAULT 'manual' NOT NULL,
  	"changed_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "customers" ADD COLUMN "price_tier" "enum_customers_price_tier" DEFAULT 'retail';
  ALTER TABLE "customers" ADD COLUMN "assigned_vendor_id" integer;
  ALTER TABLE "customers" ADD COLUMN "commission_pct" numeric DEFAULT 0;
  ALTER TABLE "invoices" ADD COLUMN "created_by_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "price_history_id" integer;
  ALTER TABLE "products_price_tiers" ADD CONSTRAINT "products_price_tiers_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "price_history" ADD CONSTRAINT "price_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "price_history" ADD CONSTRAINT "price_history_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "price_history" ADD CONSTRAINT "price_history_changed_by_id_users_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "products_price_tiers_order_idx" ON "products_price_tiers" USING btree ("_order");
  CREATE INDEX "products_price_tiers_parent_id_idx" ON "products_price_tiers" USING btree ("_parent_id");
  CREATE INDEX "price_history_tenant_idx" ON "price_history" USING btree ("tenant_id");
  CREATE INDEX "price_history_product_idx" ON "price_history" USING btree ("product_id");
  CREATE INDEX "price_history_changed_by_idx" ON "price_history" USING btree ("changed_by_id");
  CREATE INDEX "price_history_updated_at_idx" ON "price_history" USING btree ("updated_at");
  CREATE INDEX "price_history_created_at_idx" ON "price_history" USING btree ("created_at");
  ALTER TABLE "customers" ADD CONSTRAINT "customers_assigned_vendor_id_users_id_fk" FOREIGN KEY ("assigned_vendor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_price_history_fk" FOREIGN KEY ("price_history_id") REFERENCES "public"."price_history"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "customers_price_tier_idx" ON "customers" USING btree ("price_tier");
  CREATE INDEX "customers_assigned_vendor_idx" ON "customers" USING btree ("assigned_vendor_id");
  CREATE INDEX "invoices_created_by_idx" ON "invoices" USING btree ("created_by_id");
  CREATE INDEX "payload_locked_documents_rels_price_history_id_idx" ON "payload_locked_documents_rels" USING btree ("price_history_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "products_price_tiers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "price_history" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "products_price_tiers" CASCADE;
  DROP TABLE "price_history" CASCADE;
  ALTER TABLE "customers" DROP CONSTRAINT "customers_assigned_vendor_id_users_id_fk";
  
  ALTER TABLE "invoices" DROP CONSTRAINT "invoices_created_by_id_users_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_price_history_fk";
  
  ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE text;
  ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'employee'::text;
  DROP TYPE "public"."enum_users_role";
  CREATE TYPE "public"."enum_users_role" AS ENUM('super-admin', 'tenant-admin', 'supervisor', 'cashier', 'employee');
  ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'employee'::"public"."enum_users_role";
  ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE "public"."enum_users_role" USING "role"::"public"."enum_users_role";
  DROP INDEX "customers_price_tier_idx";
  DROP INDEX "customers_assigned_vendor_idx";
  DROP INDEX "invoices_created_by_idx";
  DROP INDEX "payload_locked_documents_rels_price_history_id_idx";
  ALTER TABLE "customers" DROP COLUMN "price_tier";
  ALTER TABLE "customers" DROP COLUMN "assigned_vendor_id";
  ALTER TABLE "customers" DROP COLUMN "commission_pct";
  ALTER TABLE "invoices" DROP COLUMN "created_by_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "price_history_id";
  DROP TYPE "public"."enum_customers_price_tier";
  DROP TYPE "public"."enum_products_price_tiers_tier";
  DROP TYPE "public"."enum_price_history_trigger";`)
}
