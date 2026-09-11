import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_approvals_type" AS ENUM('credit_over_limit');
  CREATE TYPE "public"."enum_approvals_status" AS ENUM('pending', 'approved', 'consumed', 'rejected', 'expired');
  CREATE TABLE "approvals" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"type" "enum_approvals_type" DEFAULT 'credit_over_limit' NOT NULL,
  	"status" "enum_approvals_status" DEFAULT 'pending' NOT NULL,
  	"requested_by_id" integer NOT NULL,
  	"resolved_by_id" integer,
  	"decision_note" varchar,
  	"ref_collection" varchar DEFAULT 'customers',
  	"ref_id" numeric,
  	"payload" jsonb NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "approvals_id" integer;
  ALTER TABLE "approvals" ADD CONSTRAINT "approvals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "approvals" ADD CONSTRAINT "approvals_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "approvals_tenant_idx" ON "approvals" USING btree ("tenant_id");
  CREATE INDEX "approvals_type_idx" ON "approvals" USING btree ("type");
  CREATE INDEX "approvals_requested_by_idx" ON "approvals" USING btree ("requested_by_id");
  CREATE INDEX "approvals_resolved_by_idx" ON "approvals" USING btree ("resolved_by_id");
  CREATE INDEX "approvals_ref_id_idx" ON "approvals" USING btree ("ref_id");
  CREATE INDEX "approvals_updated_at_idx" ON "approvals" USING btree ("updated_at");
  CREATE INDEX "approvals_created_at_idx" ON "approvals" USING btree ("created_at");
  CREATE INDEX "tenant_status_idx" ON "approvals" USING btree ("tenant_id","status");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_approvals_fk" FOREIGN KEY ("approvals_id") REFERENCES "public"."approvals"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_approvals_id_idx" ON "payload_locked_documents_rels" USING btree ("approvals_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "approvals" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "approvals" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_approvals_fk";
  
  DROP INDEX "payload_locked_documents_rels_approvals_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "approvals_id";
  DROP TYPE "public"."enum_approvals_type";
  DROP TYPE "public"."enum_approvals_status";`)
}
