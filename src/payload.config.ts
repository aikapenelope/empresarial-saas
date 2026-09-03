import path from 'path';
import { fileURLToPath } from 'url';
import { buildConfig } from 'payload';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant';
import { es } from '@payloadcms/translations/languages/es';
import { en } from '@payloadcms/translations/languages/en';
import sharp from 'sharp';

import { Users } from './collections/Users';
import { Tenants } from './collections/Tenants';
import { Media } from './collections/Media';
import { erpPlugin } from './plugins/erp';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export default buildConfig({
  admin: {
    user: Users.slug,
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
  collections: [Tenants, Users, Media],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || 'empresarial-saas-secret-key-32chars-minimum',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sharp: sharp as any,
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || process.env.POSTGRES_URL || '',
      max: 10, // Optimal for Serverless RSC with Supabase Transaction Pooler (port 6543)
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
      ssl: process.env.SUPABASE_CA_CERT
        ? {
            rejectUnauthorized: true,
            ca: process.env.SUPABASE_CA_CERT.replace(/\\n/g, '\n'),
          }
        : {
            rejectUnauthorized: false,
          },
    },
    push: false,
  }),
  plugins: [
    // El plugin ERP inyecta Customers, Invoices y CustomerPayments antes de que multiTenantPlugin los aisle por inquilino
    erpPlugin({
      features: {
        crm: true,
        accountsReceivable: true,
        dualCurrency: true,
        whatsappEngagement: true,
      },
    }),
    multiTenantPlugin({
      collections: {
        customers: {},
        invoices: {},
        'customer-payments': {},
        media: {},
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
  ],
});
