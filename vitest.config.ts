import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * ─── Vitest (Sprint 18) ─────────────────────────────────────────────────────
 *
 * Dos niveles de pruebas:
 *  - `tests/unit/`: utilidades puras (calendario de negocio UTC-4, CSV,
 *    schemas Zod) — sin BD, corren en segundos en cualquier entorno.
 *  - `tests/integration/`: Local API de Payload contra Postgres real
 *    (cluster local 54322 vía scripts/db-local.sh, o el service container
 *    de GitHub Actions — ver .github/workflows/ci.yml). Las migraciones se
 *    aplican ANTES de la suite (`scripts/db-local.sh migrate` / paso
 *    `pnpm migrate` del workflow); los tests NO mutan el esquema.
 *
 * `fileParallelism: false`: los archivos de integración comparten UNA BD y
 * los hooks del ERP usan advisory locks por documento — la paralelización
 * entre archivos añadiría carreras sin valor.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setupEnv.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      // El config de Payload se referencia como `@payload-config` en el ecosistema
      // (Next lo resuelve vía plugin; aquí lo resolvemos explícitamente).
      '@payload-config': path.resolve(import.meta.dirname, 'src/payload.config.ts'),
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
});
