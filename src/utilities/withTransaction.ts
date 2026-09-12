import type { Payload, PayloadRequest } from 'payload';
import type { User } from '@/payload-types';

/**
 * ─── Transacción de escritura para Server Actions (Sprint R6) ───────────────
 *
 * Envuelve un bloque de escritura en una transacción de PostgreSQL accesible vía
 * Local API. Extraído de `erpActions.ts` (constitución §2.1: la infraestructura
 * de transacción pertenece a `utilities/`, no a la superficie de Next).
 *
 * El `req` resultante lleva `transactionID`, de modo que TODA operación de la
 * Local API ejecutada dentro del `fn` (y las que anida) participa de la misma
 * transacción atómica: si algo falla, se hace rollback de todo.
 */
export async function withTransaction<T>(
  payload: Payload,
  user: User,
  fn: (req: PayloadRequest) => Promise<T>,
  context?: Record<string, unknown>,
): Promise<T> {
  const transactionID = await payload.db.beginTransaction();
  const req = {
    payload,
    user,
    context: context ?? {},
    transactionID,
  } as unknown as PayloadRequest;

  try {
    const result = await fn(req);
    if (transactionID) {
      await payload.db.commitTransaction(transactionID);
    }
    return result;
  } catch (error: unknown) {
    if (transactionID) {
      await payload.db.rollbackTransaction(transactionID);
    }
    throw error;
  }
}
