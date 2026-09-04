import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_purchase_invoices_payment_terms" AS ENUM('cash', 'credit');
  CREATE TYPE "public"."enum_purchase_invoices_status" AS ENUM('draft', 'received', 'partially_paid', 'paid', 'voided');
  CREATE TYPE "public"."enum_purchase_invoices_reception_status" AS ENUM('pending', 'received');
  CREATE TYPE "public"."enum_supplier_payments_methods_method" AS ENUM('cash_usd', 'cash_ves', 'zelle', 'pago_movil', 'transfer_ves', 'binance');
  CREATE TYPE "public"."enum_supplier_payments_methods_currency" AS ENUM('USD', 'VES');
  CREATE TYPE "public"."enum_supplier_payments_status" AS ENUM('pending', 'confirmed', 'rejected');
  CREATE TABLE "suppliers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"name" varchar NOT NULL,
  	"tax_id" varchar NOT NULL,
  	"contact_name" varchar,
  	"phone" varchar,
  	"email" varchar,
  	"address" varchar,
  	"credit_allowed" boolean DEFAULT false,
  	"credit_limit_u_s_d" numeric DEFAULT 0,
  	"credit_days" numeric DEFAULT 0,
  	"current_debt_u_s_d" numeric DEFAULT 0,
  	"current_debt_v_e_s" numeric DEFAULT 0,
  	"overdue_debt_u_s_d" numeric DEFAULT 0,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "purchase_invoices_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"product_id" integer,
  	"sku" varchar,
  	"description" varchar NOT NULL,
  	"quantity" numeric DEFAULT 1 NOT NULL,
  	"unit_cost_u_s_d" numeric DEFAULT 0 NOT NULL,
  	"total_u_s_d" numeric
  );
  
  CREATE TABLE "purchase_invoices" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"invoice_number" varchar NOT NULL,
  	"supplier_id" integer NOT NULL,
  	"issue_date" timestamp(3) with time zone NOT NULL,
  	"due_date" timestamp(3) with time zone NOT NULL,
  	"payment_terms" "enum_purchase_invoices_payment_terms" DEFAULT 'cash' NOT NULL,
  	"status" "enum_purchase_invoices_status" DEFAULT 'received' NOT NULL,
  	"reception_status" "enum_purchase_invoices_reception_status" DEFAULT 'pending' NOT NULL,
  	"reception_warehouse_id" integer,
  	"reception_date" timestamp(3) with time zone,
  	"exchange_rate_snapshot" numeric DEFAULT 1 NOT NULL,
  	"total_u_s_d" numeric NOT NULL,
  	"total_v_e_s" numeric NOT NULL,
  	"balance_u_s_d" numeric NOT NULL,
  	"balance_v_e_s" numeric NOT NULL,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "supplier_payments_methods" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"method" "enum_supplier_payments_methods_method" NOT NULL,
  	"currency" "enum_supplier_payments_methods_currency" DEFAULT 'USD' NOT NULL,
  	"amount" numeric NOT NULL,
  	"exchange_rate" numeric DEFAULT 1 NOT NULL,
  	"amount_u_s_d" numeric,
  	"reference" varchar,
  	"receipt_id" integer
  );
  
  CREATE TABLE "supplier_payments_allocations" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"purchase_invoice_id" integer NOT NULL,
  	"allocated_amount_u_s_d" numeric NOT NULL
  );
  
  CREATE TABLE "supplier_payments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"payment_number" varchar NOT NULL,
  	"supplier_id" integer NOT NULL,
  	"payment_date" timestamp(3) with time zone NOT NULL,
  	"status" "enum_supplier_payments_status" DEFAULT 'confirmed' NOT NULL,
  	"total_u_s_d" numeric NOT NULL,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "stock_movements" ADD COLUMN "purchase_invoice_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "suppliers_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "purchase_invoices_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "supplier_payments_id" integer;
  ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "purchase_invoices_items" ADD CONSTRAINT "purchase_invoices_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "purchase_invoices_items" ADD CONSTRAINT "purchase_invoices_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."purchase_invoices"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_reception_warehouse_id_warehouses_id_fk" FOREIGN KEY ("reception_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "supplier_payments_methods" ADD CONSTRAINT "supplier_payments_methods_receipt_id_media_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "supplier_payments_methods" ADD CONSTRAINT "supplier_payments_methods_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."supplier_payments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "supplier_payments_allocations" ADD CONSTRAINT "supplier_payments_allocations_purchase_invoice_id_purchase_invoices_id_fk" FOREIGN KEY ("purchase_invoice_id") REFERENCES "public"."purchase_invoices"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "supplier_payments_allocations" ADD CONSTRAINT "supplier_payments_allocations_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."supplier_payments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "suppliers_tenant_idx" ON "suppliers" USING btree ("tenant_id");
  CREATE INDEX "suppliers_name_idx" ON "suppliers" USING btree ("name");
  CREATE INDEX "suppliers_tax_id_idx" ON "suppliers" USING btree ("tax_id");
  CREATE INDEX "suppliers_phone_idx" ON "suppliers" USING btree ("phone");
  CREATE INDEX "suppliers_updated_at_idx" ON "suppliers" USING btree ("updated_at");
  CREATE INDEX "suppliers_created_at_idx" ON "suppliers" USING btree ("created_at");
  CREATE INDEX "purchase_invoices_items_order_idx" ON "purchase_invoices_items" USING btree ("_order");
  CREATE INDEX "purchase_invoices_items_parent_id_idx" ON "purchase_invoices_items" USING btree ("_parent_id");
  CREATE INDEX "purchase_invoices_items_product_idx" ON "purchase_invoices_items" USING btree ("product_id");
  CREATE INDEX "purchase_invoices_tenant_idx" ON "purchase_invoices" USING btree ("tenant_id");
  CREATE INDEX "purchase_invoices_invoice_number_idx" ON "purchase_invoices" USING btree ("invoice_number");
  CREATE INDEX "purchase_invoices_supplier_idx" ON "purchase_invoices" USING btree ("supplier_id");
  CREATE INDEX "purchase_invoices_reception_warehouse_idx" ON "purchase_invoices" USING btree ("reception_warehouse_id");
  CREATE INDEX "purchase_invoices_updated_at_idx" ON "purchase_invoices" USING btree ("updated_at");
  CREATE INDEX "purchase_invoices_created_at_idx" ON "purchase_invoices" USING btree ("created_at");
  CREATE INDEX "supplier_payments_methods_order_idx" ON "supplier_payments_methods" USING btree ("_order");
  CREATE INDEX "supplier_payments_methods_parent_id_idx" ON "supplier_payments_methods" USING btree ("_parent_id");
  CREATE INDEX "supplier_payments_methods_receipt_idx" ON "supplier_payments_methods" USING btree ("receipt_id");
  CREATE INDEX "supplier_payments_allocations_order_idx" ON "supplier_payments_allocations" USING btree ("_order");
  CREATE INDEX "supplier_payments_allocations_parent_id_idx" ON "supplier_payments_allocations" USING btree ("_parent_id");
  CREATE INDEX "supplier_payments_allocations_purchase_invoice_idx" ON "supplier_payments_allocations" USING btree ("purchase_invoice_id");
  CREATE INDEX "supplier_payments_tenant_idx" ON "supplier_payments" USING btree ("tenant_id");
  CREATE INDEX "supplier_payments_payment_number_idx" ON "supplier_payments" USING btree ("payment_number");
  CREATE INDEX "supplier_payments_supplier_idx" ON "supplier_payments" USING btree ("supplier_id");
  CREATE INDEX "supplier_payments_updated_at_idx" ON "supplier_payments" USING btree ("updated_at");
  CREATE INDEX "supplier_payments_created_at_idx" ON "supplier_payments" USING btree ("created_at");
  ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchase_invoice_id_purchase_invoices_id_fk" FOREIGN KEY ("purchase_invoice_id") REFERENCES "public"."purchase_invoices"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_suppliers_fk" FOREIGN KEY ("suppliers_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_purchase_invoices_fk" FOREIGN KEY ("purchase_invoices_id") REFERENCES "public"."purchase_invoices"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_supplier_payments_fk" FOREIGN KEY ("supplier_payments_id") REFERENCES "public"."supplier_payments"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "stock_movements_purchase_invoice_idx" ON "stock_movements" USING btree ("purchase_invoice_id");
  CREATE INDEX "payload_locked_documents_rels_suppliers_id_idx" ON "payload_locked_documents_rels" USING btree ("suppliers_id");
  CREATE INDEX "payload_locked_documents_rels_purchase_invoices_id_idx" ON "payload_locked_documents_rels" USING btree ("purchase_invoices_id");
  CREATE INDEX "payload_locked_documents_rels_supplier_payments_id_idx" ON "payload_locked_documents_rels" USING btree ("supplier_payments_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "suppliers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "purchase_invoices_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "purchase_invoices" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "supplier_payments_methods" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "supplier_payments_allocations" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "supplier_payments" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "suppliers" CASCADE;
  DROP TABLE "purchase_invoices_items" CASCADE;
  DROP TABLE "purchase_invoices" CASCADE;
  DROP TABLE "supplier_payments_methods" CASCADE;
  DROP TABLE "supplier_payments_allocations" CASCADE;
  DROP TABLE "supplier_payments" CASCADE;
  ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_purchase_invoice_id_purchase_invoices_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_suppliers_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_purchase_invoices_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_supplier_payments_fk";
  
  DROP INDEX "stock_movements_purchase_invoice_idx";
  DROP INDEX "payload_locked_documents_rels_suppliers_id_idx";
  DROP INDEX "payload_locked_documents_rels_purchase_invoices_id_idx";
  DROP INDEX "payload_locked_documents_rels_supplier_payments_id_idx";
  ALTER TABLE "stock_movements" DROP COLUMN "purchase_invoice_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "suppliers_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "purchase_invoices_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "supplier_payments_id";
  DROP TYPE "public"."enum_purchase_invoices_payment_terms";
  DROP TYPE "public"."enum_purchase_invoices_status";
  DROP TYPE "public"."enum_purchase_invoices_reception_status";
  DROP TYPE "public"."enum_supplier_payments_methods_method";
  DROP TYPE "public"."enum_supplier_payments_methods_currency";
  DROP TYPE "public"."enum_supplier_payments_status";`)
}
