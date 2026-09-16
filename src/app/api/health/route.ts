import { getPayload } from 'payload';
import { sql } from '@payloadcms/db-postgres';
import config from '@payload-config';

/**
 * ─── Health check (Sprint CI-5) ─────────────────────────────────────────────
 *
 * Liveness para smoke post-deploy y para monitores externos. Ejecuta una
 * consulta TRIVIAL (`SELECT 1`) por el pool de Payload: si la BD responde, el
 * servicio está vivo. No expone datos ni requiere sesión.
 *
 * Payload NO trae un endpoint de health propio (verificado en `node_modules`);
 * así que se implementa como Route Handler de Next.js, el patrón oficial de
 * Next para esto. `force-dynamic` evita que el build lo prerenderice.
 */
export const dynamic = 'force-dynamic';

export async function GET(req?: Request): Promise<Response> {
  try {
    const checkDb = async () => {
      const payload = await getPayload({ config });
      await payload.db.drizzle.execute(sql`SELECT 1`);
    };

    // Timeout de 5s para evitar que conexiones colgadas agoten el runtime Serverless
    await Promise.race([
      checkDb(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Database ping timeout')), 5000)
      ),
    ]);

    const url = req ? new URL(req.url) : null;
    if (url?.searchParams.get('verbose') === 'true') {
      return Response.json(
        { ok: true, status: 'healthy', database: 'connected' },
        { status: 200 }
      );
    }

    return Response.json({ ok: true }, { status: 200 });
  } catch {
    // 503 (no 500): el servicio está arriba pero su dependencia crítica no.
    return Response.json(
      { ok: false, status: 'degraded', database: 'disconnected' },
      { status: 503 }
    );
  }
}
