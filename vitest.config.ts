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
 *
 * ─── Cobertura (Sprint CI-5) ────────────────────────────────────────────────
 * `coverage.include` limita el cálculo a `src/` y EXCLUYE lo que no es código
 * propio testeable: tipos generados (`payload-types.ts`), DDL de migraciones y
 * declaraciones. El ratchet de `thresholds` se fija con los valores medidos
 * (ver `scripts/…`/PR): el CI falla si BAJA; subirlo es siempre bienvenido.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setupEnv.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        // Tipos generados por `payload generate:types`.
        'src/payload-types.ts',
        // DDL de migraciones: se validan con `tests/integration/schemaMirror.test.ts`.
        'src/migrations/**',
        // Importmap generado para el admin de Payload.
        'src/app/(payload)/importMap.js',
        // Capa de presentación (RSC/páginas y componentes): NO es responsabilidad
        // de Vitest — la cubre el smoke E2E de navegador (Sprint CI-4) y, en su
        // mayoría, son envoltorios finos sobre las utilities. Incluirla diluiría
        // el ratchet y lo haría ruido en vez de señal.
        'src/app/**',
        'src/components/**',
      ],
      thresholds: {
        // RATCHET (medido el 2026-09-12 sobre `main`, 154 tests):
        //   statements 28.63 · branches 20.21 · functions 25.66 · lines 28.99
        // Se fija 1 punto por debajo: el CI FALLA si baja, y subirlo siempre
        // es bienvenido. Lo que arrastra el número son dos módulos grandes y
        // aún sin cobertura (`actions/erpActions.ts` ~3.9k LOC y
        // `utilities/erpData.ts` ~2.2k LOC) — backlog documentado en la
        // auditoría (Sprint R6b / CI-3).
        statements: 28,
        branches: 20,
        functions: 25,
        lines: 28,
      },
    },
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
