import path from 'path';
import { fileURLToPath } from 'url';
import { buildConfig } from 'payload';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant';
import { es } from '@payloadcms/translations/languages/es';
import { en } from '@payloadcms/translations/languages/en';
import sharp from 'sharp';

import { s3Storage } from '@payloadcms/storage-s3';
import { nodemailerAdapter } from '@payloadcms/email-nodemailer';
import { resendAdapter } from '@payloadcms/email-resend';
import { importExportPlugin } from '@payloadcms/plugin-import-export';

import { Users } from './collections/Users';
import { Tenants } from './collections/Tenants';
import { Media } from './collections/Media';
import { Customers } from './collections/Customers';
import { Invoices } from './collections/Invoices';
import { CustomerPayments } from './collections/CustomerPayments';
import { Categories } from './collections/Categories';
import { Warehouses } from './collections/Warehouses';
import { Products } from './collections/Products';
import { StockMovements } from './collections/StockMovements';
import { BillOfMaterials } from './collections/BillOfMaterials';
import { ProductionOrders } from './collections/ProductionOrders';
import { Suppliers } from './collections/Suppliers';
import { PurchaseInvoices } from './collections/PurchaseInvoices';
import { SupplierPayments } from './collections/SupplierPayments';
import { CashRegisters } from './collections/CashRegisters';
import { CashClosures } from './collections/CashClosures';
import { IndustryTemplates } from './collections/IndustryTemplates';
import { Quotes } from './collections/Quotes';
import { Orders } from './collections/Orders';
import { DeliveryNotes } from './collections/DeliveryNotes';
import { Alerts } from './collections/Alerts';
import { InventoryCounts } from './collections/InventoryCounts';
import { salesInventoryPlugin } from './plugins/salesInventory';
import { pricingPlugin } from './plugins/pricing';
import { auditPlugin } from './plugins/audit';
import { seedIndustryTemplateTask } from './jobs/seedIndustryTemplate';
import { evaluateAlertsTask } from './jobs/evaluateAlerts';
import { migrations } from './migrations';
import { SUPABASE_ROOT_CA } from './constants/supabaseCa';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const payloadSecret = process.env.PAYLOAD_SECRET;
if (!payloadSecret) {
  throw new Error(
    'PAYLOAD_SECRET environment variable is missing. A secure 32+ character secret is required.',
  );
}

// Route migration CLI operations through DATABASE_DIRECT_URL while retaining DATABASE_URI for Serverless runtime
const isMigration =
  process.env.IS_PAYLOAD_MIGRATION === 'true' ||
  process.argv.some((arg) => arg.includes('migrate'));

const dbConnectionString = isMigration
  ? process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URI || process.env.POSTGRES_URL || ''
  : process.env.DATABASE_URI || process.env.POSTGRES_URL || '';

// Load Supabase Root CA cert to strictly enforce rejectUnauthorized: true without MITM vulnerabilities
const caCert = process.env.SUPABASE_CA_CERT
  ? process.env.SUPABASE_CA_CERT.replace(/\\n/g, '\n')
  : SUPABASE_ROOT_CA;

// BD local de desarrollo/pruebas (scripts/db-local.sh → /tmp/pg-local:54322):
// su certificado es self-signed, así que ahí se desactiva la verificación de
// CA (el tráfico va por loopback). Con Supabase se mantiene SSL estricto.
const isLocalDb = /^(postgres(?:ql)?):\/\/[^@]*@(localhost|127\.0\.0\.1)[:/]/.test(
  dbConnectionString,
);

export default buildConfig({
  admin: {
    user: Users.slug,
    // Sprint 34: enlace visible en el dashboard del admin hacia el ERP.
    // La operación diaria vive en /{tenant}/erp con su login propio (/login);
    // el admin queda para quien lo necesite explícitamente.
    components: {
      beforeDashboard: ['/components/admin/GoToErpLink'],
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  i18n: {
    supportedLanguages: {
      es,
      en,
    },
    fallbackLanguage: 'es',
  },
  collections: [
    Tenants,
    Users,
    Media,
    Customers,
    Invoices,
    CustomerPayments,
    Categories,
    Warehouses,
    Products,
    StockMovements,
    BillOfMaterials,
    ProductionOrders,
    Suppliers,
    PurchaseInvoices,
    SupplierPayments,
    CashRegisters,
    CashClosures,
    IndustryTemplates,
    Quotes,
    Orders,
    DeliveryNotes,
    Alerts,
    InventoryCounts,
  ],
  jobs: {
    tasks: [seedIndustryTemplateTask, evaluateAlertsTask],
    // Sprint 22: el evaluador de alertas se encola cada 15 min y el autoRun
    // procesa la cola (schedule + autoRun del Jobs Queue oficial de Payload).
    autoRun: [
      {
        cron: '*/15 * * * *',
        queue: 'alerts',
        limit: 10,
      },
    ],
    // Conservar los registros de jobs (éxitos y errores) como pista de auditoría del onboarding
    deleteJobOnComplete: false,
  },
  editor: lexicalEditor(),
  secret: payloadSecret,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  sharp,
  db: postgresAdapter({
    pool: {
      connectionString: dbConnectionString,
      max: isMigration ? 2 : 10, // Optimal for Serverless RSC (10) / Migration CLI (2)
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
      ssl: isLocalDb
        ? false
        : {
            rejectUnauthorized: true,
            ...(caCert ? { ca: caCert } : {}),
          },
    },
    push: false,
    migrationDir: path.resolve(dirname, 'migrations'),
    prodMigrations: migrations,
  }),
  // Email: adaptador oficial de Resend (@payloadcms/email-resend) cuando hay
  // RESEND_API_KEY — ligero y recomendado para Vercel (HTTP, sin puertos SMTP).
  // Sin la clave, se conserva nodemailer/SMTP (o el mock de ethereal en dev).
  email: process.env.RESEND_API_KEY
    ? resendAdapter({
        defaultFromAddress: process.env.SMTP_FROM_ADDRESS || 'soporte@empresarial-saas.com',
        defaultFromName: process.env.SMTP_FROM_NAME || 'Empresarial SaaS',
        apiKey: process.env.RESEND_API_KEY,
      })
    : nodemailerAdapter({
        defaultFromAddress: process.env.SMTP_FROM_ADDRESS || 'soporte@empresarial-saas.com',
        defaultFromName: process.env.SMTP_FROM_NAME || 'Empresarial SaaS',
        transportOptions: process.env.SMTP_HOST
          ? {
              host: process.env.SMTP_HOST,
              port: Number(process.env.SMTP_PORT) || 587,
              auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
              },
            }
          : undefined,
      }),
  plugins: [
    // Sprint 7: acoplamiento venta→inventario (campos + hooks compuestos) empaquetado
    // como plugin canónico de la constitución ((options) => (config) => Config).
    salesInventoryPlugin({ enabled: true }),
    pricingPlugin({ enabled: true }),
    auditPlugin({
      enabled: true,
      collections: [
        'invoices',
        'customer-payments',
        'purchase-invoices',
        'supplier-payments',
        'products',
        'cash-closures',
        'quotes',
        'orders',
        'delivery-notes',
        'tenants',
      ],
    }),
    multiTenantPlugin({
      collections: {
        media: {},
        customers: {},
        invoices: {},
        'customer-payments': {},
        categories: {},
        warehouses: {},
        products: {},
        'stock-movements': {},
        'bill-of-materials': {},
        'production-orders': {},
        suppliers: {},
        'purchase-invoices': {},
        'supplier-payments': {},
        'cash-registers': {},
        'cash-closures': {},
        quotes: {},
        orders: {},
        'delivery-notes': {},
        alerts: {},
        'price-history': {},
        // audit-log NO es multi-tenant: es la bitácora GLOBAL de la plataforma y
        // registra también operaciones sin inquilino (p. ej. la creación de
        // empresas por el super-admin). El plugin inyecta aquí un campo tenant
        // required que hace reventar TODA escritura de auditoría de operaciones
        // globales. El aislamiento por inquilino lo aplica el access read del
        // propio auditPlugin (patrón de Users.ts).
        'inventory-counts': {},
      },
      userHasAccessToAllTenants: (user) => Boolean(user?.role === 'super-admin'),
      tenantsArrayField: {
        includeDefaultField: true,
        arrayFieldAccess: {
          read: ({ req: { user } }) => Boolean(user),
          create: ({ req: { user } }) => user?.role === 'super-admin',
          update: ({ req: { user } }) => user?.role === 'super-admin',
        },
        tenantFieldAccess: {
          create: ({ req: { user } }) => user?.role === 'super-admin',
          update: ({ req: { user } }) => user?.role === 'super-admin',
        },
      },
    }),
    s3Storage({
      collections: {
        media: true,
      },
      bucket: process.env.S3_BUCKET || '',
      config: {
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
        },
        region: process.env.S3_REGION || 'us-east-1',
        ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      },
      enabled: Boolean(process.env.S3_BUCKET),
    }),
    // ─── Sprint 9: Importación/Exportación de catálogos (plugin oficial) ───
    // Catálogo ONLY: los campos ledger (currentStock, deudas) están marcados con
    // custom['plugin-import-export'].disabled y el stock masivo entra por el Kardex
    // (importStockAction). El tenant se resuelve solo: el plugin escribe con
    // overrideAccess:false y los beforeValidate de cada colección toman el tenant
    // del usuario que sube el archivo.
    importExportPlugin({
      collections: [
        { slug: 'products', import: { disableJobsQueue: true, limit: 2000 }, export: { disableJobsQueue: true, limit: 5000, format: 'csv' } },
        { slug: 'customers', import: { disableJobsQueue: true, limit: 2000 }, export: { disableJobsQueue: true, limit: 5000, format: 'csv' } },
        { slug: 'categories', import: { disableJobsQueue: true, limit: 500 }, export: { disableJobsQueue: true, limit: 2000, format: 'csv' } },
        { slug: 'suppliers', import: { disableJobsQueue: true, limit: 2000 }, export: { disableJobsQueue: true, limit: 5000, format: 'csv' } },
      ],
      overrideImportCollection: ({ collection }) => ({
        ...collection,
        access: {
          read: ({ req: { user } }) => Boolean(user?.role === 'super-admin' || user?.role === 'tenant-admin'),
          create: ({ req: { user } }) => Boolean(user?.role === 'super-admin' || user?.role === 'tenant-admin'),
          update: ({ req: { user } }) => Boolean(user?.role === 'super-admin'),
          delete: ({ req: { user } }) => Boolean(user?.role === 'super-admin'),
        },
        admin: {
          ...collection.admin,
          group: 'Administración',
        },
      }),
      overrideExportCollection: ({ collection }) => ({
        ...collection,
        access: {
          read: ({ req: { user } }) => Boolean(user?.role === 'super-admin' || user?.role === 'tenant-admin'),
          create: ({ req: { user } }) => Boolean(user?.role === 'super-admin' || user?.role === 'tenant-admin'),
          update: ({ req: { user } }) => Boolean(user?.role === 'super-admin'),
          delete: ({ req: { user } }) => Boolean(user?.role === 'super-admin'),
        },
        admin: {
          ...collection.admin,
          group: 'Administración',
        },
      }),
    }),
  ],
});
