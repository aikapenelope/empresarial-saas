import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_cash_registers_current_status" AS ENUM('open', 'closed');
  CREATE TYPE "public"."enum_cash_closures_status" AS ENUM('open', 'closed', 'audited');
  ALTER TYPE "public"."enum_customer_payments_methods_method" ADD VALUE 'pos_ves' BEFORE 'zelle';
  ALTER TYPE "public"."enum_supplier_payments_methods_method" ADD VALUE 'pos_ves' BEFORE 'zelle';
  CREATE TABLE "cash_registers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"name" varchar NOT NULL,
  	"code" varchar NOT NULL,
  	"warehouse_id" integer NOT NULL,
  	"current_status" "enum_cash_registers_current_status" DEFAULT 'closed' NOT NULL,
  	"current_closure_id" integer,
  	"active" boolean DEFAULT true,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "cash_registers_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "cash_closures" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"closure_number" varchar NOT NULL,
  	"cash_register_id" integer NOT NULL,
  	"opened_by_id" integer NOT NULL,
  	"closed_by_id" integer,
  	"audited_by_id" integer,
  	"status" "enum_cash_closures_status" DEFAULT 'open' NOT NULL,
  	"opened_at" timestamp(3) with time zone NOT NULL,
  	"closed_at" timestamp(3) with time zone,
  	"audited_at" timestamp(3) with time zone,
  	"opening_float_cash_u_s_d" numeric DEFAULT 0,
  	"opening_float_cash_v_e_s" numeric DEFAULT 0,
  	"opening_float_notes" varchar,
  	"declared_totals_cash_u_s_d" numeric DEFAULT 0,
  	"declared_totals_cash_v_e_s" numeric DEFAULT 0,
  	"declared_totals_pos_v_e_s" numeric DEFAULT 0,
  	"declared_totals_pago_movil_v_e_s" numeric DEFAULT 0,
  	"declared_totals_transfer_v_e_s" numeric DEFAULT 0,
  	"declared_totals_zelle_u_s_d" numeric DEFAULT 0,
  	"declared_totals_binance_u_s_d" numeric DEFAULT 0,
  	"system_totals_collections_cash_u_s_d" numeric DEFAULT 0,
  	"system_totals_collections_cash_v_e_s" numeric DEFAULT 0,
  	"system_totals_collections_pos_v_e_s" numeric DEFAULT 0,
  	"system_totals_collections_pago_movil_v_e_s" numeric DEFAULT 0,
  	"system_totals_collections_transfer_v_e_s" numeric DEFAULT 0,
  	"system_totals_collections_zelle_u_s_d" numeric DEFAULT 0,
  	"system_totals_collections_binance_u_s_d" numeric DEFAULT 0,
  	"system_totals_collections_total_collections_u_s_d" numeric DEFAULT 0,
  	"system_totals_disbursements_cash_u_s_d_out" numeric DEFAULT 0,
  	"system_totals_disbursements_cash_v_e_s_out" numeric DEFAULT 0,
  	"system_totals_disbursements_pos_v_e_s_out" numeric DEFAULT 0,
  	"system_totals_disbursements_pago_movil_v_e_s_out" numeric DEFAULT 0,
  	"system_totals_disbursements_transfer_v_e_s_out" numeric DEFAULT 0,
  	"system_totals_disbursements_zelle_u_s_d_out" numeric DEFAULT 0,
  	"system_totals_disbursements_binance_u_s_d_out" numeric DEFAULT 0,
  	"system_totals_disbursements_total_disbursements_u_s_d" numeric DEFAULT 0,
  	"system_totals_expected_expected_cash_u_s_d" numeric DEFAULT 0,
  	"system_totals_expected_expected_cash_v_e_s" numeric DEFAULT 0,
  	"system_totals_expected_expected_pos_v_e_s" numeric DEFAULT 0,
  	"system_totals_expected_expected_pago_movil_v_e_s" numeric DEFAULT 0,
  	"system_totals_expected_expected_transfer_v_e_s" numeric DEFAULT 0,
  	"system_totals_expected_expected_zelle_u_s_d" numeric DEFAULT 0,
  	"system_totals_expected_expected_binance_u_s_d" numeric DEFAULT 0,
  	"system_totals_expected_net_total_u_s_d" numeric DEFAULT 0,
  	"differences_diff_cash_u_s_d" numeric DEFAULT 0,
  	"differences_diff_cash_v_e_s" numeric DEFAULT 0,
  	"differences_diff_pos_v_e_s" numeric DEFAULT 0,
  	"differences_diff_pago_movil_v_e_s" numeric DEFAULT 0,
  	"differences_diff_transfer_v_e_s" numeric DEFAULT 0,
  	"differences_diff_zelle_u_s_d" numeric DEFAULT 0,
  	"differences_diff_binance_u_s_d" numeric DEFAULT 0,
  	"differences_total_discrepancy_u_s_d" numeric DEFAULT 0,
  	"differences_has_discrepancy" boolean DEFAULT false,
  	"notes" varchar,
  	"supervisor_notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "customer_payments" ADD COLUMN "cash_register_id" integer;
  ALTER TABLE "customer_payments" ADD COLUMN "cash_closure_id" integer;
  ALTER TABLE "supplier_payments" ADD COLUMN "cash_register_id" integer;
  ALTER TABLE "supplier_payments" ADD COLUMN "cash_closure_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "cash_registers_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "cash_closures_id" integer;
  ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_current_closure_id_cash_closures_id_fk" FOREIGN KEY ("current_closure_id") REFERENCES "public"."cash_closures"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cash_registers_rels" ADD CONSTRAINT "cash_registers_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."cash_registers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cash_registers_rels" ADD CONSTRAINT "cash_registers_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cash_closures" ADD CONSTRAINT "cash_closures_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cash_closures" ADD CONSTRAINT "cash_closures_cash_register_id_cash_registers_id_fk" FOREIGN KEY ("cash_register_id") REFERENCES "public"."cash_registers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cash_closures" ADD CONSTRAINT "cash_closures_opened_by_id_users_id_fk" FOREIGN KEY ("opened_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cash_closures" ADD CONSTRAINT "cash_closures_closed_by_id_users_id_fk" FOREIGN KEY ("closed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cash_closures" ADD CONSTRAINT "cash_closures_audited_by_id_users_id_fk" FOREIGN KEY ("audited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "cash_registers_tenant_idx" ON "cash_registers" USING btree ("tenant_id");
  CREATE INDEX "cash_registers_name_idx" ON "cash_registers" USING btree ("name");
  CREATE INDEX "cash_registers_code_idx" ON "cash_registers" USING btree ("code");
  CREATE INDEX "cash_registers_warehouse_idx" ON "cash_registers" USING btree ("warehouse_id");
  CREATE INDEX "cash_registers_current_closure_idx" ON "cash_registers" USING btree ("current_closure_id");
  CREATE INDEX "cash_registers_updated_at_idx" ON "cash_registers" USING btree ("updated_at");
  CREATE INDEX "cash_registers_created_at_idx" ON "cash_registers" USING btree ("created_at");
  CREATE INDEX "cash_registers_rels_order_idx" ON "cash_registers_rels" USING btree ("order");
  CREATE INDEX "cash_registers_rels_parent_idx" ON "cash_registers_rels" USING btree ("parent_id");
  CREATE INDEX "cash_registers_rels_path_idx" ON "cash_registers_rels" USING btree ("path");
  CREATE INDEX "cash_registers_rels_users_id_idx" ON "cash_registers_rels" USING btree ("users_id");
  CREATE INDEX "cash_closures_tenant_idx" ON "cash_closures" USING btree ("tenant_id");
  CREATE INDEX "cash_closures_closure_number_idx" ON "cash_closures" USING btree ("closure_number");
  CREATE INDEX "cash_closures_cash_register_idx" ON "cash_closures" USING btree ("cash_register_id");
  CREATE INDEX "cash_closures_opened_by_idx" ON "cash_closures" USING btree ("opened_by_id");
  CREATE INDEX "cash_closures_closed_by_idx" ON "cash_closures" USING btree ("closed_by_id");
  CREATE INDEX "cash_closures_audited_by_idx" ON "cash_closures" USING btree ("audited_by_id");
  CREATE INDEX "cash_closures_updated_at_idx" ON "cash_closures" USING btree ("updated_at");
  CREATE INDEX "cash_closures_created_at_idx" ON "cash_closures" USING btree ("created_at");
  ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_cash_register_id_cash_registers_id_fk" FOREIGN KEY ("cash_register_id") REFERENCES "public"."cash_registers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_cash_closure_id_cash_closures_id_fk" FOREIGN KEY ("cash_closure_id") REFERENCES "public"."cash_closures"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_cash_register_id_cash_registers_id_fk" FOREIGN KEY ("cash_register_id") REFERENCES "public"."cash_registers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_cash_closure_id_cash_closures_id_fk" FOREIGN KEY ("cash_closure_id") REFERENCES "public"."cash_closures"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_cash_registers_fk" FOREIGN KEY ("cash_registers_id") REFERENCES "public"."cash_registers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_cash_closures_fk" FOREIGN KEY ("cash_closures_id") REFERENCES "public"."cash_closures"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "customer_payments_cash_register_idx" ON "customer_payments" USING btree ("cash_register_id");
  CREATE INDEX "customer_payments_cash_closure_idx" ON "customer_payments" USING btree ("cash_closure_id");
  CREATE INDEX "supplier_payments_cash_register_idx" ON "supplier_payments" USING btree ("cash_register_id");
  CREATE INDEX "supplier_payments_cash_closure_idx" ON "supplier_payments" USING btree ("cash_closure_id");
  CREATE INDEX "payload_locked_documents_rels_cash_registers_id_idx" ON "payload_locked_documents_rels" USING btree ("cash_registers_id");
  CREATE INDEX "payload_locked_documents_rels_cash_closures_id_idx" ON "payload_locked_documents_rels" USING btree ("cash_closures_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cash_registers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cash_registers_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cash_closures" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "cash_registers" CASCADE;
  DROP TABLE "cash_registers_rels" CASCADE;
  DROP TABLE "cash_closures" CASCADE;
  ALTER TABLE "customer_payments" DROP CONSTRAINT "customer_payments_cash_register_id_cash_registers_id_fk";
  
  ALTER TABLE "customer_payments" DROP CONSTRAINT "customer_payments_cash_closure_id_cash_closures_id_fk";
  
  ALTER TABLE "supplier_payments" DROP CONSTRAINT "supplier_payments_cash_register_id_cash_registers_id_fk";
  
  ALTER TABLE "supplier_payments" DROP CONSTRAINT "supplier_payments_cash_closure_id_cash_closures_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_cash_registers_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_cash_closures_fk";
  
  ALTER TABLE "customer_payments_methods" ALTER COLUMN "method" SET DATA TYPE text;
  DROP TYPE "public"."enum_customer_payments_methods_method";
  CREATE TYPE "public"."enum_customer_payments_methods_method" AS ENUM('cash_usd', 'cash_ves', 'zelle', 'pago_movil', 'transfer_ves', 'binance');
  ALTER TABLE "customer_payments_methods" ALTER COLUMN "method" SET DATA TYPE "public"."enum_customer_payments_methods_method" USING "method"::"public"."enum_customer_payments_methods_method";
  ALTER TABLE "supplier_payments_methods" ALTER COLUMN "method" SET DATA TYPE text;
  DROP TYPE "public"."enum_supplier_payments_methods_method";
  CREATE TYPE "public"."enum_supplier_payments_methods_method" AS ENUM('cash_usd', 'cash_ves', 'zelle', 'pago_movil', 'transfer_ves', 'binance');
  ALTER TABLE "supplier_payments_methods" ALTER COLUMN "method" SET DATA TYPE "public"."enum_supplier_payments_methods_method" USING "method"::"public"."enum_supplier_payments_methods_method";
  DROP INDEX "customer_payments_cash_register_idx";
  DROP INDEX "customer_payments_cash_closure_idx";
  DROP INDEX "supplier_payments_cash_register_idx";
  DROP INDEX "supplier_payments_cash_closure_idx";
  DROP INDEX "payload_locked_documents_rels_cash_registers_id_idx";
  DROP INDEX "payload_locked_documents_rels_cash_closures_id_idx";
  ALTER TABLE "customer_payments" DROP COLUMN "cash_register_id";
  ALTER TABLE "customer_payments" DROP COLUMN "cash_closure_id";
  ALTER TABLE "supplier_payments" DROP COLUMN "cash_register_id";
  ALTER TABLE "supplier_payments" DROP COLUMN "cash_closure_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "cash_registers_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "cash_closures_id";
  DROP TYPE "public"."enum_cash_registers_current_status";
  DROP TYPE "public"."enum_cash_closures_status";`)
}
