import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_alerts_type" AS ENUM('low_stock', 'inventory_diff', 'rate_change', 'overdue_invoice', 'vendor_overdue');
  CREATE TYPE "public"."enum_alerts_severity" AS ENUM('info', 'warning', 'critical');

  CREATE TABLE "alerts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"type" "enum_alerts_type" NOT NULL,
  	"severity" "enum_alerts_severity" DEFAULT 'warning' NOT NULL,
  	"message" varchar NOT NULL,
  	"ref_collection" varchar,
  	"ref_id" integer DEFAULT 0 NOT NULL,
  	"acknowledged_at" timestamp(3) with time zone,
  	"acknowledged_by_id" integer,
  	"resolved_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "alerts_id" integer;
  ALTER TABLE "alerts" ADD CONSTRAINT "alerts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledged_by_id_users_id_fk" FOREIGN KEY ("acknowledged_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "alerts_tenant_idx" ON "alerts" USING btree ("tenant_id");
  CREATE INDEX "alerts_type_idx" ON "alerts" USING btree ("type");
  CREATE INDEX "alerts_ref_id_idx" ON "alerts" USING btree ("ref_id");
  CREATE INDEX "alerts_resolved_at_idx" ON "alerts" USING btree ("resolved_at");
  CREATE INDEX "alerts_updated_at_idx" ON "alerts" USING btree ("updated_at");
  CREATE INDEX "alerts_created_at_idx" ON "alerts" USING btree ("created_at");
  CREATE UNIQUE INDEX "alerts_tenant_type_ref_id_unique" ON "alerts" USING btree ("tenant_id","type","ref_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_alerts_fk" FOREIGN KEY ("alerts_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_alerts_id_idx" ON "payload_locked_documents_rels" USING btree ("alerts_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "alerts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "alerts" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_alerts_fk";
  DROP INDEX "payload_locked_documents_rels_alerts_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "alerts_id";
  DROP TYPE "public"."enum_alerts_type";
  DROP TYPE "public"."enum_alerts_severity";`)
}
