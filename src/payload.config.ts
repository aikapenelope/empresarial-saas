import fs from 'fs';
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
import { migrations } from './migrations';

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
const defaultCertPath = path.resolve(dirname, '../certs/supabase-root-ca.crt');
const rootCert = fs.existsSync(defaultCertPath)
  ? fs.readFileSync(defaultCertPath, 'utf8')
  : undefined;

const caCert = process.env.SUPABASE_CA_CERT
  ? process.env.SUPABASE_CA_CERT.replace(/\\n/g, '\n')
  : rootCert;

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
      ssl: {
        rejectUnauthorized: true,
        ...(caCert ? { ca: caCert } : {}),
      },
    },
    push: false,
    migrationDir: path.resolve(dirname, 'migrations'),
    prodMigrations: migrations,
  }),
  plugins: [
    multiTenantPlugin({
      collections: {
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
