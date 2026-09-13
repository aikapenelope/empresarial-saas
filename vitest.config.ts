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
        // RATCHET de cobertura — valores ROBUSTOS entre entornos.
        //
        // ⚠️ Medición empírica (misma revisión, misma suite: 32 archivos / 201
        // pruebas + 3 expected fail):
        //   local (macOS/darwin)
        //     statements 39.68 · branches 30.62 · functions 32.74 · lines 40.27
        //   GitHub Actions (ubuntu-latest · Node 22)
        //     statements 39.57 · branches 30.44 · functions 32.59 · lines 40.14
        //
        // La cobertura de v8 NO es idéntica entre plataformas (deltas medidos de
        // ~0,11-0,18 puntos; también cambia el denominador de funciones). Por eso
        // fijar el valor EXACTO medido en local hace fallar el CI aunque el código
        // sea el mismo — pasó en el PR #99 y dejó `main` en rojo para todos los PRs.
        //
        // Regla: umbral = floor(medida_en_CI − 0,5), es decir el peor entorno
        // conocido con medio punto de holgura para variaciones de plataforma/Node.
        // Sigue siendo un ratchet: cualquier bajada REAL (añadir código sin
        // pruebas, perder cobertura) rompe el CI; lo que NO rompe es el ruido de
        // entorno.
        //
        // Al SUBIR la cobertura: re-medir EN CI (no en local) y actualizar estos
        // números de forma deliberada en el mismo PR.
        statements: 39.0,
        branches: 29.9,
        functions: 32.0,
        lines: 39.6,
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
