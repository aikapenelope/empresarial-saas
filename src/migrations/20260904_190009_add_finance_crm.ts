import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_customers_status" AS ENUM('lead', 'first_time', 'recurring', 'vip', 'inactive');
  CREATE TYPE "public"."enum_invoices_payment_terms" AS ENUM('cash', 'credit');
  CREATE TYPE "public"."enum_invoices_status" AS ENUM('draft', 'issued', 'partially_paid', 'paid', 'voided');
  CREATE TYPE "public"."enum_customer_payments_methods_method" AS ENUM('cash_usd', 'cash_ves', 'zelle', 'pago_movil', 'transfer_ves', 'binance');
  CREATE TYPE "public"."enum_customer_payments_methods_currency" AS ENUM('USD', 'VES');
  CREATE TYPE "public"."enum_customer_payments_status" AS ENUM('pending', 'confirmed', 'rejected');
  CREATE TABLE "customers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"name" varchar NOT NULL,
  	"tax_id" varchar NOT NULL,
  	"phone" varchar NOT NULL,
  	"email" varchar,
  	"address" varchar,
  	"status" "enum_customers_status" DEFAULT 'lead' NOT NULL,
  	"credit_allowed" boolean DEFAULT false,
  	"credit_limit_u_s_d" numeric DEFAULT 0,
  	"credit_days" numeric DEFAULT 0,
  	"current_debt_u_s_d" numeric DEFAULT 0,
  	"current_debt_v_e_s" numeric DEFAULT 0,
  	"overdue_debt_u_s_d" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "invoices_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"sku" varchar,
  	"description" varchar NOT NULL,
  	"quantity" numeric DEFAULT 1 NOT NULL,
  	"unit_price_u_s_d" numeric DEFAULT 0 NOT NULL,
  	"total_u_s_d" numeric
  );
  
  CREATE TABLE "invoices" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"invoice_number" varchar NOT NULL,
  	"customer_id" integer NOT NULL,
  	"issue_date" timestamp(3) with time zone NOT NULL,
  	"due_date" timestamp(3) with time zone NOT NULL,
  	"payment_terms" "enum_invoices_payment_terms" DEFAULT 'cash' NOT NULL,
  	"status" "enum_invoices_status" DEFAULT 'issued' NOT NULL,
  	"exchange_rate_snapshot" numeric DEFAULT 1 NOT NULL,
  	"total_u_s_d" numeric NOT NULL,
  	"total_v_e_s" numeric NOT NULL,
  	"balance_u_s_d" numeric NOT NULL,
  	"balance_v_e_s" numeric NOT NULL,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "customer_payments_methods" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"method" "enum_customer_payments_methods_method" NOT NULL,
  	"currency" "enum_customer_payments_methods_currency" DEFAULT 'USD' NOT NULL,
  	"amount" numeric NOT NULL,
  	"exchange_rate" numeric DEFAULT 1 NOT NULL,
  	"amount_u_s_d" numeric,
  	"reference" varchar,
  	"receipt_id" integer
  );
  
  CREATE TABLE "customer_payments_allocations" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"invoice_id" integer NOT NULL,
  	"allocated_amount_u_s_d" numeric NOT NULL
  );
  
  CREATE TABLE "customer_payments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"payment_number" varchar NOT NULL,
  	"customer_id" integer NOT NULL,
  	"payment_date" timestamp(3) with time zone NOT NULL,
  	"status" "enum_customer_payments_status" DEFAULT 'confirmed' NOT NULL,
  	"total_u_s_d" numeric NOT NULL,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "users_tenants" DROP CONSTRAINT "users_tenants_tenant_id_tenants_id_fk";
  
  ALTER TABLE "users" ADD COLUMN "password" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "customers_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "invoices_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "customer_payments_id" integer;
  ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "invoices_items" ADD CONSTRAINT "invoices_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "customer_payments_methods" ADD CONSTRAINT "customer_payments_methods_receipt_id_media_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "customer_payments_methods" ADD CONSTRAINT "customer_payments_methods_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."customer_payments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "customer_payments_allocations" ADD CONSTRAINT "customer_payments_allocations_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "customer_payments_allocations" ADD CONSTRAINT "customer_payments_allocations_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."customer_payments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "customers_tenant_idx" ON "customers" USING btree ("tenant_id");
  CREATE INDEX "customers_name_idx" ON "customers" USING btree ("name");
  CREATE INDEX "customers_tax_id_idx" ON "customers" USING btree ("tax_id");
  CREATE INDEX "customers_phone_idx" ON "customers" USING btree ("phone");
  CREATE INDEX "customers_updated_at_idx" ON "customers" USING btree ("updated_at");
  CREATE INDEX "customers_created_at_idx" ON "customers" USING btree ("created_at");
  CREATE INDEX "invoices_items_order_idx" ON "invoices_items" USING btree ("_order");
  CREATE INDEX "invoices_items_parent_id_idx" ON "invoices_items" USING btree ("_parent_id");
  CREATE INDEX "invoices_tenant_idx" ON "invoices" USING btree ("tenant_id");
  CREATE INDEX "invoices_invoice_number_idx" ON "invoices" USING btree ("invoice_number");
  CREATE INDEX "invoices_customer_idx" ON "invoices" USING btree ("customer_id");
  CREATE INDEX "invoices_updated_at_idx" ON "invoices" USING btree ("updated_at");
  CREATE INDEX "invoices_created_at_idx" ON "invoices" USING btree ("created_at");
  CREATE INDEX "customer_payments_methods_order_idx" ON "customer_payments_methods" USING btree ("_order");
  CREATE INDEX "customer_payments_methods_parent_id_idx" ON "customer_payments_methods" USING btree ("_parent_id");
  CREATE INDEX "customer_payments_methods_receipt_idx" ON "customer_payments_methods" USING btree ("receipt_id");
  CREATE INDEX "customer_payments_allocations_order_idx" ON "customer_payments_allocations" USING btree ("_order");
  CREATE INDEX "customer_payments_allocations_parent_id_idx" ON "customer_payments_allocations" USING btree ("_parent_id");
  CREATE INDEX "customer_payments_allocations_invoice_idx" ON "customer_payments_allocations" USING btree ("invoice_id");
  CREATE INDEX "customer_payments_tenant_idx" ON "customer_payments" USING btree ("tenant_id");
  CREATE INDEX "customer_payments_payment_number_idx" ON "customer_payments" USING btree ("payment_number");
  CREATE INDEX "customer_payments_customer_idx" ON "customer_payments" USING btree ("customer_id");
  CREATE INDEX "customer_payments_updated_at_idx" ON "customer_payments" USING btree ("updated_at");
  CREATE INDEX "customer_payments_created_at_idx" ON "customer_payments" USING btree ("created_at");
  ALTER TABLE "users_tenants" ADD CONSTRAINT "users_tenants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_customers_fk" FOREIGN KEY ("customers_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_invoices_fk" FOREIGN KEY ("invoices_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_customer_payments_fk" FOREIGN KEY ("customer_payments_id") REFERENCES "public"."customer_payments"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_customers_id_idx" ON "payload_locked_documents_rels" USING btree ("customers_id");
  CREATE INDEX "payload_locked_documents_rels_invoices_id_idx" ON "payload_locked_documents_rels" USING btree ("invoices_id");
  CREATE INDEX "payload_locked_documents_rels_customer_payments_id_idx" ON "payload_locked_documents_rels" USING btree ("customer_payments_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_customers_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_invoices_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_customer_payments_fk";
  
  DROP INDEX IF EXISTS "payload_locked_documents_rels_customers_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_invoices_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_customer_payments_id_idx";
  
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "customers_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "invoices_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "customer_payments_id";
  
  ALTER TABLE "users" DROP COLUMN IF EXISTS "password";
  
  ALTER TABLE "users_tenants" DROP CONSTRAINT IF EXISTS "users_tenants_tenant_id_tenants_id_fk";
  ALTER TABLE "users_tenants" ADD CONSTRAINT "users_tenants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;

  ALTER TABLE IF EXISTS "customers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "invoices_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "invoices" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "customer_payments_methods" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "customer_payments_allocations" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "customer_payments" DISABLE ROW LEVEL SECURITY;

  DROP TABLE IF EXISTS "customer_payments_allocations" CASCADE;
  DROP TABLE IF EXISTS "customer_payments_methods" CASCADE;
  DROP TABLE IF EXISTS "customer_payments" CASCADE;
  DROP TABLE IF EXISTS "invoices_items" CASCADE;
  DROP TABLE IF EXISTS "invoices" CASCADE;
  DROP TABLE IF EXISTS "customers" CASCADE;

  DROP TYPE IF EXISTS "public"."enum_customers_status";
  DROP TYPE IF EXISTS "public"."enum_invoices_payment_terms";
  DROP TYPE IF EXISTS "public"."enum_invoices_status";
  DROP TYPE IF EXISTS "public"."enum_customer_payments_methods_method";
  DROP TYPE IF EXISTS "public"."enum_customer_payments_methods_currency";
  DROP TYPE IF EXISTS "public"."enum_customer_payments_status";`)
}
