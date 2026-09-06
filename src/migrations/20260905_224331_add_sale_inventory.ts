import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_stock_movements_movement_type" ADD VALUE 'sale_return' BEFORE 'production_consume';
  ALTER TABLE "invoices_items" ADD COLUMN "product_id" integer;
  ALTER TABLE "invoices" ADD COLUMN "warehouse_id" integer;
  ALTER TABLE "invoices_items" ADD CONSTRAINT "invoices_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "invoices_items_product_idx" ON "invoices_items" USING btree ("product_id");
  CREATE INDEX "invoices_warehouse_idx" ON "invoices" USING btree ("warehouse_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "invoices_items" DROP CONSTRAINT "invoices_items_product_id_products_id_fk";
  
  ALTER TABLE "invoices" DROP CONSTRAINT "invoices_warehouse_id_warehouses_id_fk";
  
  ALTER TABLE "stock_movements" ALTER COLUMN "movement_type" SET DATA TYPE text;
  DROP TYPE "public"."enum_stock_movements_movement_type";
  CREATE TYPE "public"."enum_stock_movements_movement_type" AS ENUM('purchase_in', 'sale_out', 'production_consume', 'production_output', 'transfer', 'adjustment_positive', 'adjustment_negative', 'scrap');
  ALTER TABLE "stock_movements" ALTER COLUMN "movement_type" SET DATA TYPE "public"."enum_stock_movements_movement_type" USING "movement_type"::"public"."enum_stock_movements_movement_type";
  DROP INDEX "invoices_items_product_idx";
  DROP INDEX "invoices_warehouse_idx";
  ALTER TABLE "invoices_items" DROP COLUMN "product_id";
  ALTER TABLE "invoices" DROP COLUMN "warehouse_id";`)
}
