import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_delivery_notes_status" AS ENUM('issued', 'voided');

  CREATE TABLE "delivery_notes_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"order_item_index" integer NOT NULL,
  	"product_id" integer,
  	"sku" varchar,
  	"description" varchar NOT NULL,
  	"quantity" numeric NOT NULL,
  	"unit_price_u_s_d" numeric DEFAULT 0 NOT NULL,
  	"discount_pct" numeric DEFAULT 0 NOT NULL
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
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "delivery_notes_id" integer;
  ALTER TABLE "delivery_notes_items" ADD CONSTRAINT "delivery_notes_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "delivery_notes_items" ADD CONSTRAINT "delivery_notes_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."delivery_notes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "delivery_notes_items_order_idx" ON "delivery_notes_items" USING btree ("_order");
  CREATE INDEX "delivery_notes_items_parent_id_idx" ON "delivery_notes_items" USING btree ("_parent_id");
  CREATE INDEX "delivery_notes_items_product_idx" ON "delivery_notes_items" USING btree ("product_id");
  CREATE INDEX "delivery_notes_tenant_idx" ON "delivery_notes" USING btree ("tenant_id");
  CREATE INDEX "delivery_notes_note_number_idx" ON "delivery_notes" USING btree ("note_number");
  CREATE INDEX "delivery_notes_order_idx" ON "delivery_notes" USING btree ("order_id");
  CREATE INDEX "delivery_notes_customer_idx" ON "delivery_notes" USING btree ("customer_id");
  CREATE INDEX "delivery_notes_status_idx" ON "delivery_notes" USING btree ("status");
  CREATE INDEX "delivery_notes_invoice_idx" ON "delivery_notes" USING btree ("invoice_id");
  CREATE INDEX "delivery_notes_updated_at_idx" ON "delivery_notes" USING btree ("updated_at");
  CREATE INDEX "delivery_notes_created_at_idx" ON "delivery_notes" USING btree ("created_at");
  CREATE UNIQUE INDEX "delivery_notes_tenant_note_number_unique" ON "delivery_notes" USING btree ("tenant_id","note_number");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_delivery_notes_fk" FOREIGN KEY ("delivery_notes_id") REFERENCES "public"."delivery_notes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_delivery_notes_id_idx" ON "payload_locked_documents_rels" USING btree ("delivery_notes_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "delivery_notes_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "delivery_notes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_delivery_notes_fk";
  DROP INDEX "payload_locked_documents_rels_delivery_notes_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "delivery_notes_id";
  DROP TABLE "delivery_notes_items" CASCADE;
  DROP TABLE "delivery_notes" CASCADE;
  DROP TYPE "public"."enum_delivery_notes_status";`)
}
