import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "storefront_config_enabled" boolean DEFAULT false;
    ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "storefront_config_whatsapp_orders_number" varchar;
    ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "storefront_config_portal_title" varchar DEFAULT 'Portal de Pedidos y Catálogo Mayorista';
    ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "storefront_config_portal_description" varchar DEFAULT 'Precios sujetos a cambio sin previo aviso. Despachos y condiciones acordadas con su asesor comercial.';
    ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "storefront_config_tagline" varchar;
    ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "storefront_config_announcement_text" varchar;
    ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "storefront_config_delivery_policy" varchar;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "tenants" DROP COLUMN IF EXISTS "storefront_config_tagline";
    ALTER TABLE "tenants" DROP COLUMN IF EXISTS "storefront_config_announcement_text";
    ALTER TABLE "tenants" DROP COLUMN IF EXISTS "storefront_config_delivery_policy";
  `);
}
