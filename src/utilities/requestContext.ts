import type { PayloadRequest } from 'payload';

/**
 * ─── Aislamiento de flags de contexto para operaciones internas ─────────────
 *
 * Payload fusiona el `context` de CADA llamada de la Local API dentro del
 * `req.context` compartido (createLocalReq → req.context = merge) y NUNCA lo
 * restaura: un flag supresor (`skipInventoryRecalculation`,
 * `skipBalanceRecalculation`, `allowInternalStockUpdate`, …) pasado en una
 * operación interna queda pegado al request y desactiva en cascada los hooks
 * de TODAS las operaciones posteriores del mismo request. Síntoma histórico:
 * en una venta de varios productos solo el primero recalculaba `currentStock`.
 *
 * Este helper ejecuta la operación interna sobre una COPIA del contexto y
 * restaura el objeto del llamador al terminar (incluso si la operación
 * lanza), de modo que los flags apliquen únicamente a la operación envuelta.
 *
 * Regla de la casa (AGENTS.md §2): toda operación anidada que pase flags de
 * recursión por `context:` se envuelve con `runIsolatedContext`.
 */
export async function runIsolatedContext<T>(
  req: PayloadRequest,
  op: (req: PayloadRequest) => Promise<T>,
): Promise<T> {
  const previousContext = req.context;
  // Copia fresca: el merge de createLocalReq y los flags del `context:` de la
  // llamada anidada afectan solo a esta copia, jamás al objeto del llamador.
  req.context = { ...previousContext };
  try {
    return await op(req);
  } finally {
    req.context = previousContext;
  }
}
