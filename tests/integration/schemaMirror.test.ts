import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { getPayload } from 'payload';
import type { Payload } from 'payload';
import config from '@payload-config';
import { sql } from '@payloadcms/db-postgres';
import { migrations } from '@/migrations';
import { DOC_NUMBER_TABLES } from '@/utilities/documentNumbering';

/**
 * ─── Espejo de esquema: config ↔ base de datos (Sprint CI-1) ────────────────
 *
 * Guarda de la clase de bug descubierta en el Sprint R5: el scheduling de
 * Payload (task.schedule → jobs.scheduling + jobs.stats) añade el campo `meta`
 * a `payload_jobs` y el global `payload_jobs_stats`, y la tarea `evaluateAlerts`
 * estaba en el config… pero NINGUNA migración creó esos objetos (drift de
 * snapshot). En una BD construida con estas migraciones, TODO `payload.jobs.queue`
 * fallaba con 42703/22P02 y el evaluador de alertas / el onboarding nunca se
 * encolaban.
 *
 * Este test compara el **config** (y la lista de migraciones) contra el esquema
 * REAL de Postgres, de modo que cualquier desincronización rompe el CI en vez de
 * llegar a producción. No muta el esquema: sólo consulta `information_schema`,
 * `pg_enum` y `payload_migrations`.
 *
 * Validación (documentada en el PR): borrar a mano `payload_jobs.meta`, quitar
 * un valor del enum o eliminar un índice único hace FALLAR el test.
 */

type Row = Record<string, unknown>;

let payload: Payload;
let db: { execute: (q: unknown) => Promise<{ rows: Row[] }> };

async function query(q: unknown): Promise<Row[]> {
  const res = await db.execute(q);
  return res.rows ?? [];
}

/**
 * Normaliza un identificador para comparar camelCase ↔ snake_case sin replicar
 * el algoritmo interno del adaptador (basta con que el nombre exista).
 */
function normalize(identifier: string): string {
  return identifier.replace(/_/g, '').toLowerCase();
}

async function columnsOf(table: string): Promise<Set<string>> {
  const rows = await query(
    sql`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${table}`,
  );
  return new Set(rows.map((r) => normalize(String(r.column_name))));
}

async function tableExists(table: string): Promise<boolean> {
  const rows = await query(
    sql`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${table}`,
  );
  return rows.length > 0;
}

async function enumValues(typeName: string): Promise<Set<string>> {
  const rows = await query(
    sql`SELECT e.enumlabel AS label FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = ${typeName}`,
  );
  return new Set(rows.map((r) => String(r.label)));
}

/** Índices únicos que incluyen `tenant_id` en su definición. */
async function uniqueTenantIndexes(): Promise<{ table: string; index: string }[]> {
  const rows = await query(
    sql`SELECT tablename AS table, indexname AS index FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexdef LIKE 'CREATE UNIQUE INDEX%'
          AND indexdef LIKE '%tenant_id%'`,
  );
  return rows.map((r) => ({ table: String(r.table), index: String(r.index) }));
}

beforeAll(async () => {
  payload = await getPayload({ config });
  // `payload.db.drizzle` es el handle SQL del adaptador (el mismo que usa
  // `getActiveDb` sin transacción). Aquí sólo se hacen consultas de
  // introspección de lectura.
  db = (payload.db as unknown as { drizzle: { execute: (q: unknown) => Promise<{ rows: Row[] }> } })
    .drizzle;
});

afterAll(async () => {
  const handle = payload.db as unknown as { destroy?: () => Promise<void> };
  if (handle?.destroy) await handle.destroy();
});

describe('espejo de esquema (CI-1)', () => {
  it('toda migración del proyecto está registrada y aplicada en la BD', async () => {
    // 1) Archivos de migración presentes en disco (excluyendo el índice).
    const dir = path.resolve(process.cwd(), 'src/migrations');
    const filesOnDisk = readdirSync(dir)
      .filter((file) => file.endsWith('.ts') && file !== 'index.ts')
      .map((file) => file.replace(/\.ts$/, ''));

    // 2) Registradas en `src/migrations/index.ts` (prodMigrations: lo que corre
    //    `payload migrate`). Un archivo sin registrar NUNCA se aplica.
    const registered = migrations
      .map((m) => m.name)
      .filter((name): name is string => typeof name === 'string');
    const registeredSet = new Set(registered);

    const unregistered = filesOnDisk.filter((name) => !registeredSet.has(name));
    expect(
      unregistered,
      `Migraciones en disco SIN registrar en src/migrations/index.ts: ${unregistered.join(', ')}. ` +
        'Un archivo no registrado en el índice jamás se aplica.',
    ).toEqual([]);

    // 3) Aplicadas en la BD (historial `payload_migrations`).
    const applied = new Set(
      (await query(sql`SELECT name FROM payload_migrations`)).map((r) => String(r.name)),
    );
    const pending = registered.filter((name) => !applied.has(name));

    expect(
      pending,
      `Migraciones NO aplicadas (drift): ${pending.join(', ')}. Corre \`pnpm migrate\`.`,
    ).toEqual([]);
  });

  it('el enum de tareas del Jobs Queue contiene cada tarea registrada en el config', async () => {
    // Fuente de verdad: el config. Si se registra una tarea sin migración que la
    // agregue al enum, `payload.jobs.queue` falla con 22P02 (bug exacto de R5).
    const configured = (payload.config.jobs?.tasks ?? []).map((task) => task.slug);
    expect(configured.length).toBeGreaterThan(0);

    const jobsEnum = await enumValues('enum_payload_jobs_task_slug');
    const missing = configured.filter((slug) => !jobsEnum.has(slug));

    expect(
      missing,
      `Tareas en el config AUSENTES de enum_payload_jobs_task_slug: ${missing.join(', ')}. ` +
        'Falta una migración que haga ADD VALUE al enum.',
    ).toEqual([]);
  });

  it('el esquema del Jobs Queue que exige el scheduling existe (drift R5)', async () => {
    const jobColumns = await columnsOf('payload_jobs');
    expect(jobColumns.has(normalize('meta')), 'Falta payload_jobs.meta').toBe(true);

    expect(
      await tableExists('payload_jobs_stats'),
      'Falta la tabla payload_jobs_stats (la crea el scheduling de Payload)',
    ).toBe(true);
  });

  it('cada colección con caducidad de compartición tiene su columna (drift R4)', async () => {
    const withExpiry = payload.config.collections.filter((collection) =>
      collection.fields.some((field) => 'name' in field && field.name === 'shareTokenExpiresAt'),
    );

    // El campo lo introdujo el Sprint R4 en 3 dominios (quotes/invoices/delivery-notes).
    expect(withExpiry.length).toBeGreaterThanOrEqual(3);

    for (const collection of withExpiry) {
      const columns = await columnsOf(collection.slug.replace(/-/g, '_'));
      expect(
        columns.has(normalize('shareTokenExpiresAt')),
        `${collection.slug}: falta la columna share_token_expires_at`,
      ).toBe(true);
    }
  });

  it('cada documento numerado tiene índice único (tenant, número)', async () => {
    const indexes = await uniqueTenantIndexes();
    const tablesWithIndex = new Set(indexes.map((i) => i.table));
    const numberedTables = [...new Set(Object.values(DOC_NUMBER_TABLES).map((e) => e.table))];
    const missing = numberedTables.filter((table) => !tablesWithIndex.has(table));

    expect(
      missing,
      `Tablas numeradas SIN índice único por inquilino: ${missing.join(', ')}. ` +
        'La red de seguridad (tenant_id, número) de las migraciones *_number_uniques se perdió.',
    ).toEqual([]);
  });
});

