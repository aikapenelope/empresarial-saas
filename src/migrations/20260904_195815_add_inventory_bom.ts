import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_warehouses_type" AS ENUM('main', 'raw_materials', 'work_in_progress', 'scrap', 'retail');
  CREATE TYPE "public"."enum_products_product_type" AS ENUM('standard', 'raw_material', 'manufactured', 'service');
  CREATE TYPE "public"."enum_products_unit_of_measure" AS ENUM('unit', 'kg', 'g', 'l', 'ml', 'm', 'box');
  CREATE TYPE "public"."enum_products_tax_rate" AS ENUM('exempt', 'general', 'reduced');
  CREATE TYPE "public"."enum_stock_movements_movement_type" AS ENUM('purchase_in', 'sale_out', 'production_consume', 'production_output', 'transfer', 'adjustment_positive', 'adjustment_negative', 'scrap');
  CREATE TYPE "public"."enum_production_orders_status" AS ENUM('draft', 'planned', 'in_progress', 'completed', 'cancelled');
  CREATE TABLE "categories" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"name" varchar NOT NULL,
  	"code" varchar NOT NULL,
  	"description" varchar,
  	"parent_category_id" integer,
  	"is_active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "warehouses" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"name" varchar NOT NULL,
  	"code" varchar NOT NULL,
  	"type" "enum_warehouses_type" DEFAULT 'main' NOT NULL,
  	"location" varchar,
  	"is_default" boolean DEFAULT false,
  	"is_active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "products" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"name" varchar NOT NULL,
  	"sku" varchar NOT NULL,
  	"barcode" varchar,
  	"product_type" "enum_products_product_type" DEFAULT 'standard' NOT NULL,
  	"category_id" integer,
  	"unit_of_measure" "enum_products_unit_of_measure" DEFAULT 'unit' NOT NULL,
  	"cost_u_s_d" numeric DEFAULT 0 NOT NULL,
  	"price_u_s_d" numeric DEFAULT 0 NOT NULL,
  	"tax_rate" "enum_products_tax_rate" DEFAULT 'exempt' NOT NULL,
  	"track_inventory" boolean DEFAULT true,
  	"min_stock_alert" numeric DEFAULT 0,
  	"max_stock" numeric,
  	"current_stock" numeric DEFAULT 0,
  	"description" varchar,
  	"image_id" integer,
  	"is_active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "stock_movements" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"reference" varchar NOT NULL,
  	"movement_type" "enum_stock_movements_movement_type" NOT NULL,
  	"product_id" integer NOT NULL,
  	"source_warehouse_id" integer,
  	"target_warehouse_id" integer,
  	"quantity" numeric NOT NULL,
  	"unit_cost_u_s_d" numeric DEFAULT 0 NOT NULL,
  	"total_cost_u_s_d" numeric DEFAULT 0 NOT NULL,
  	"reason" varchar,
  	"production_order_id" integer,
  	"invoice_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "bill_of_materials_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"raw_material_id" integer NOT NULL,
  	"quantity" numeric NOT NULL,
  	"scrap_factor_percent" numeric DEFAULT 0,
  	"unit_cost_snapshot_u_s_d" numeric,
  	"subtotal_cost_u_s_d" numeric
  );
  
  CREATE TABLE "bill_of_materials" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"name" varchar NOT NULL,
  	"product_id" integer NOT NULL,
  	"output_quantity" numeric DEFAULT 1 NOT NULL,
  	"labor_cost_u_s_d" numeric DEFAULT 0,
  	"indirect_costs_u_s_d" numeric DEFAULT 0,
  	"total_batch_cost_u_s_d" numeric,
  	"total_unit_cost_u_s_d" numeric,
  	"instructions" varchar,
  	"is_active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "production_orders" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"order_number" varchar NOT NULL,
  	"product_id" integer NOT NULL,
  	"bom_id" integer NOT NULL,
  	"quantity_planned" numeric NOT NULL,
  	"quantity_produced" numeric,
  	"source_warehouse_id" integer NOT NULL,
  	"target_warehouse_id" integer NOT NULL,
  	"status" "enum_production_orders_status" DEFAULT 'draft' NOT NULL,
  	"start_date" timestamp(3) with time zone,
  	"completion_date" timestamp(3) with time zone,
  	"total_cost_u_s_d" numeric,
  	"unit_cost_u_s_d" numeric,
  	"assigned_to_id" integer,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "categories_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "warehouses_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "products_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "stock_movements_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "bill_of_materials_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "production_orders_id" integer;
  ALTER TABLE "categories" ADD CONSTRAINT "categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_category_id_categories_id_fk" FOREIGN KEY ("parent_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_source_warehouse_id_warehouses_id_fk" FOREIGN KEY ("source_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_target_warehouse_id_warehouses_id_fk" FOREIGN KEY ("target_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_orders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bill_of_materials_items" ADD CONSTRAINT "bill_of_materials_items_raw_material_id_products_id_fk" FOREIGN KEY ("raw_material_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bill_of_materials_items" ADD CONSTRAINT "bill_of_materials_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."bill_of_materials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "bill_of_materials" ADD CONSTRAINT "bill_of_materials_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bill_of_materials" ADD CONSTRAINT "bill_of_materials_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_bom_id_bill_of_materials_id_fk" FOREIGN KEY ("bom_id") REFERENCES "public"."bill_of_materials"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_source_warehouse_id_warehouses_id_fk" FOREIGN KEY ("source_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_target_warehouse_id_warehouses_id_fk" FOREIGN KEY ("target_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "categories_tenant_idx" ON "categories" USING btree ("tenant_id");
  CREATE INDEX "categories_name_idx" ON "categories" USING btree ("name");
  CREATE INDEX "categories_code_idx" ON "categories" USING btree ("code");
  CREATE INDEX "categories_parent_category_idx" ON "categories" USING btree ("parent_category_id");
  CREATE INDEX "categories_updated_at_idx" ON "categories" USING btree ("updated_at");
  CREATE INDEX "categories_created_at_idx" ON "categories" USING btree ("created_at");
  CREATE INDEX "warehouses_tenant_idx" ON "warehouses" USING btree ("tenant_id");
  CREATE INDEX "warehouses_name_idx" ON "warehouses" USING btree ("name");
  CREATE INDEX "warehouses_code_idx" ON "warehouses" USING btree ("code");
  CREATE INDEX "warehouses_updated_at_idx" ON "warehouses" USING btree ("updated_at");
  CREATE INDEX "warehouses_created_at_idx" ON "warehouses" USING btree ("created_at");
  CREATE INDEX "products_tenant_idx" ON "products" USING btree ("tenant_id");
  CREATE INDEX "products_name_idx" ON "products" USING btree ("name");
  CREATE INDEX "products_sku_idx" ON "products" USING btree ("sku");
  CREATE INDEX "products_barcode_idx" ON "products" USING btree ("barcode");
  CREATE INDEX "products_category_idx" ON "products" USING btree ("category_id");
  CREATE INDEX "products_image_idx" ON "products" USING btree ("image_id");
  CREATE INDEX "products_updated_at_idx" ON "products" USING btree ("updated_at");
  CREATE INDEX "products_created_at_idx" ON "products" USING btree ("created_at");
  CREATE INDEX "stock_movements_tenant_idx" ON "stock_movements" USING btree ("tenant_id");
  CREATE INDEX "stock_movements_reference_idx" ON "stock_movements" USING btree ("reference");
  CREATE INDEX "stock_movements_product_idx" ON "stock_movements" USING btree ("product_id");
  CREATE INDEX "stock_movements_source_warehouse_idx" ON "stock_movements" USING btree ("source_warehouse_id");
  CREATE INDEX "stock_movements_target_warehouse_idx" ON "stock_movements" USING btree ("target_warehouse_id");
  CREATE INDEX "stock_movements_production_order_idx" ON "stock_movements" USING btree ("production_order_id");
  CREATE INDEX "stock_movements_invoice_idx" ON "stock_movements" USING btree ("invoice_id");
  CREATE INDEX "stock_movements_updated_at_idx" ON "stock_movements" USING btree ("updated_at");
  CREATE INDEX "stock_movements_created_at_idx" ON "stock_movements" USING btree ("created_at");
  CREATE INDEX "bill_of_materials_items_order_idx" ON "bill_of_materials_items" USING btree ("_order");
  CREATE INDEX "bill_of_materials_items_parent_id_idx" ON "bill_of_materials_items" USING btree ("_parent_id");
  CREATE INDEX "bill_of_materials_items_raw_material_idx" ON "bill_of_materials_items" USING btree ("raw_material_id");
  CREATE INDEX "bill_of_materials_tenant_idx" ON "bill_of_materials" USING btree ("tenant_id");
  CREATE INDEX "bill_of_materials_name_idx" ON "bill_of_materials" USING btree ("name");
  CREATE INDEX "bill_of_materials_product_idx" ON "bill_of_materials" USING btree ("product_id");
  CREATE INDEX "bill_of_materials_updated_at_idx" ON "bill_of_materials" USING btree ("updated_at");
  CREATE INDEX "bill_of_materials_created_at_idx" ON "bill_of_materials" USING btree ("created_at");
  CREATE INDEX "production_orders_tenant_idx" ON "production_orders" USING btree ("tenant_id");
  CREATE INDEX "production_orders_order_number_idx" ON "production_orders" USING btree ("order_number");
  CREATE INDEX "production_orders_product_idx" ON "production_orders" USING btree ("product_id");
  CREATE INDEX "production_orders_bom_idx" ON "production_orders" USING btree ("bom_id");
  CREATE INDEX "production_orders_source_warehouse_idx" ON "production_orders" USING btree ("source_warehouse_id");
  CREATE INDEX "production_orders_target_warehouse_idx" ON "production_orders" USING btree ("target_warehouse_id");
  CREATE INDEX "production_orders_assigned_to_idx" ON "production_orders" USING btree ("assigned_to_id");
  CREATE INDEX "production_orders_updated_at_idx" ON "production_orders" USING btree ("updated_at");
  CREATE INDEX "production_orders_created_at_idx" ON "production_orders" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_warehouses_fk" FOREIGN KEY ("warehouses_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_stock_movements_fk" FOREIGN KEY ("stock_movements_id") REFERENCES "public"."stock_movements"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_bill_of_materials_fk" FOREIGN KEY ("bill_of_materials_id") REFERENCES "public"."bill_of_materials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_production_orders_fk" FOREIGN KEY ("production_orders_id") REFERENCES "public"."production_orders"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_categories_id_idx" ON "payload_locked_documents_rels" USING btree ("categories_id");
  CREATE INDEX "payload_locked_documents_rels_warehouses_id_idx" ON "payload_locked_documents_rels" USING btree ("warehouses_id");
  CREATE INDEX "payload_locked_documents_rels_products_id_idx" ON "payload_locked_documents_rels" USING btree ("products_id");
  CREATE INDEX "payload_locked_documents_rels_stock_movements_id_idx" ON "payload_locked_documents_rels" USING btree ("stock_movements_id");
  CREATE INDEX "payload_locked_documents_rels_bill_of_materials_id_idx" ON "payload_locked_documents_rels" USING btree ("bill_of_materials_id");
  CREATE INDEX "payload_locked_documents_rels_production_orders_id_idx" ON "payload_locked_documents_rels" USING btree ("production_orders_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "categories" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "warehouses" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "products" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "stock_movements" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "bill_of_materials_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "bill_of_materials" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "production_orders" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "categories" CASCADE;
  DROP TABLE "warehouses" CASCADE;
  DROP TABLE "products" CASCADE;
  DROP TABLE "stock_movements" CASCADE;
  DROP TABLE "bill_of_materials_items" CASCADE;
  DROP TABLE "bill_of_materials" CASCADE;
  DROP TABLE "production_orders" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_categories_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_warehouses_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_products_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_stock_movements_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_bill_of_materials_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_production_orders_fk";
  
  DROP INDEX "payload_locked_documents_rels_categories_id_idx";
  DROP INDEX "payload_locked_documents_rels_warehouses_id_idx";
  DROP INDEX "payload_locked_documents_rels_products_id_idx";
  DROP INDEX "payload_locked_documents_rels_stock_movements_id_idx";
  DROP INDEX "payload_locked_documents_rels_bill_of_materials_id_idx";
  DROP INDEX "payload_locked_documents_rels_production_orders_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "categories_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "warehouses_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "products_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "stock_movements_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "bill_of_materials_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "production_orders_id";
  DROP TYPE "public"."enum_warehouses_type";
  DROP TYPE "public"."enum_products_product_type";
  DROP TYPE "public"."enum_products_unit_of_measure";
  DROP TYPE "public"."enum_products_tax_rate";
  DROP TYPE "public"."enum_stock_movements_movement_type";
  DROP TYPE "public"."enum_production_orders_status";`)
}
