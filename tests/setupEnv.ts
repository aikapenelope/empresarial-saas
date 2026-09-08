import { config as loadDotenv } from 'dotenv';

/**
 * Entorno de la suite (se ejecuta ANTES de resolver payload.config):
 *  1. Carga .env (en Next lo hace Next; aquí no hay request context).
 *  2. FUERZA la conexión a la BD de pruebas del proyecto — NUNCA a Supabase:
 *     local = cluster aislado de scripts/db-local.sh (:54322), CI = el
 *     service container Postgres del workflow. `TEST_DATABASE_URL` permite
 *     apuntar a otro Postgres desechable sin tocar este archivo.
 *
 * La URL de integración debe ser localhost/127.0.0.1 para que el selector
 * `isLocalDb` de payload.config.ts desactive la verificación de CA (en local
 * el certificado es self-signed; en el runner no hay TLS).
 */
loadDotenv();

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL || 'postgresql://postgres@127.0.0.1:54322/empresarial_dev';

// Guardarraíl anti-producción (hallazgo Devin #55): la suite crea registros
// reales persistentes, así que SOLO acepta Postgres en loopback. Cualquier
// host remoto (Supabase, staging, otro proyecto) aborta antes de conectar.
const parsedDbUrl = new URL(testDatabaseUrl);
if (!['localhost', '127.0.0.1', '::1'].includes(parsedDbUrl.hostname)) {
  throw new Error(
    `TEST_DATABASE_URL debe apuntar a un Postgres LOCAL (loopback); se recibió "${parsedDbUrl.hostname}". ` +
      'La suite escribe registros de negocio reales: jamás debe apuntar a Supabase ni a staging.',
  );
}

process.env.DATABASE_URI = testDatabaseUrl;
process.env.DATABASE_DIRECT_URL = testDatabaseUrl;

if (!process.env.PAYLOAD_SECRET) {
  process.env.PAYLOAD_SECRET = 'tests-only-secret-0123456789abcdefghijklmnopqrst';
}
