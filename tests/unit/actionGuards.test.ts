import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ─── Contrato de seguridad: toda Server Action ERP está guardada ────────────
 *
 * Sprint R1 · auditoría 2026-09-10 · P2-S0-01.
 *
 * Las Server Actions de `erpActions.ts` escriben con overrideAccess interno
 * (patrón "authorize at the edge, trust inside"): la autorización corre en
 * la FRONTERA con `requireErpTenantAccess` / `requireSuperAdmin` /
 * `requireErpUser` ANTES de cualquier escritura. Una action futura que
 * omita el guard sería una fuga multi-tenant directa.
 *
 * Este test de contrato escanea el SOURCE de las actions y falla si algún
 * `export async function *Action` no invoca uno de los tres guards dentro
 * de su cuerpo. Es deliberadamente un source-scan (regex sobre el archivo):
 * no requiere BD, corre en la suite unit, y una AST-dep añadiría
 * dependencias sin ganancia — el archivo tiene un único patrón de firma.
 */

const ACTIONS_FILES = [
  join(process.cwd(), 'src', 'actions', 'erpActions.ts'),
  join(process.cwd(), 'src', 'actions', 'shareActions.ts'),
] as const;

const GUARD_PATTERN = /requireErpTenantAccess|requireSuperAdmin|requireErpUser/;
const ACTION_EXPORT = /^export async function (\w+Action)\s*\(/gm;

/**
 * Helpers autorizadores de shareActions: las actions de compartición
 * delegan su guard en `loadAndEnsureShare` / `prepareDocumentEmail`, que
 * invocan `requireErpTenantAccess(tenantId, SHARE_ROLES)` internamente
 * (shareActions.ts). El contrato acepta guard directo o delegación a uno
 * de estos helpers — ambos son autorización en la frontera.
 */
const AUTHORIZED_HELPERS = /loadAndEnsureShare|prepareDocumentEmail/;

describe('contrato de guards de Server Actions (P2-S0-01)', () => {
  for (const file of ACTIONS_FILES) {
    // `.pop()` es `string | undefined` para TS: los paths del array son
    // literales no vacíos, pero el tipado estricto exige el fallback.
    const fileName = file.split('/').pop() ?? file;
    describe(fileName, () => {
      const source = readFileSync(file, 'utf8');
      // matchAll garantiza el grupo 1 en cada match (la regex lo exige), pero
      // el tipado de TS lo marca opcional: se filtra antes de usarlo.
      const actionNames = [...source.matchAll(ACTION_EXPORT)]
        .map((m) => m[1])
        .filter((name): name is string => typeof name === 'string');

      it('exporta al menos una Server Action (el escaneo encontró el patrón)', () => {
        expect(actionNames.length).toBeGreaterThan(0);
      });

      it.each(actionNames)(`%s invoca un guard requireErp* antes de escribir`, (name) => {
        // Cuerpo de la action: desde su firma hasta la siguiente firma exportada
        // (o fin de archivo). El guard puede llamarse en el cuerpo de la action
        // o delegarse a un helper autorizador (patrón de shareActions).
        const startMatch = new RegExp(
          `^export async function ${name}\\s*\\(`,
          'm',
        ).exec(source);
        expect(startMatch, `firma de ${name} no encontrada`).not.toBeNull();

        const startIdx = startMatch!.index;
        const nextExport = source.indexOf('export async function', startIdx + 1);
        const body = source.slice(
          startIdx,
          nextExport === -1 ? source.length : nextExport,
        );

        const guarded =
          GUARD_PATTERN.test(body) || AUTHORIZED_HELPERS.test(body);
        expect(
          guarded,
          `${name} NO invoca requireErpTenantAccess/requireSuperAdmin/requireErpUser ` +
            'ni delega en un helper autorizador (loadAndEnsureShare / ' +
            'prepareDocumentEmail). Toda Server Action debe autorizar en la ' +
            'frontera antes de escribir (patrón AGENTS.md §2.1; ver ' +
            'AUDIT-20260910/SECTOR-0).',
        ).toBe(true);
      });
    });
  }
});
