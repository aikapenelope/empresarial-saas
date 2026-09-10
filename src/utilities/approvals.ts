import type { PayloadRequest } from 'payload';
import { sql } from '@payloadcms/db-postgres';
import { getActiveDb } from './inventoryLedger';

/**
 * ─── Aprobaciones: motor single-use (IE-PR6) ────────────────────────────────
 *
 * El consumo de una aprobación debe ser ATÓMICO y de UN SOLO USO: dos pestañas
 * aprobando a la vez, o un doble submit, no pueden emitir dos facturas.
 * Patrón de la casa (igual que `nextDocumentNumber`): advisory lock
 * transaccional `hashtext('approval:{id}')` + relectura de status dentro de la
 * MISMA transacción de la venta — si la venta falla, el consumo hace rollback
 * con ella y la aprobación queda disponible para reintento.
 */

/** Ventana de validez de una solicitud. */
export const APPROVAL_TTL_HOURS = 24;

export function approvalExpiry(from: Date = new Date()): string {
  return new Date(from.getTime() + APPROVAL_TTL_HOURS * 60 * 60 * 1000).toISOString();
}

export function isApprovalExpired(expiresAt?: string | null): boolean {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  return Number.isFinite(t) && t < Date.now();
}

/**
 * Consume una aprobación APROBADA y NO expirada, verificando que corresponda
 * EXACTAMENTE a la operación que la invoca (Devin #83 🟥: sin este binding,
 * cualquier ID aprobado en contexto autorizaría datos de venta ajenos).
 * Debe correr dentro de la transacción de la operación autorizada (req con
 * transactionID): el update de status → consumed participa de ella y revierte
 * si la operación falla.
 */
export async function consumeApproval(
  req: PayloadRequest,
  approvalId: number,
  expected: { tenantId: number; input: unknown },
): Promise<void> {
  const db = getActiveDb(req);
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`approval:${approvalId}`}))`);

  const approval = await req.payload.findByID({
    collection: 'approvals',
    id: approvalId,
    depth: 0,
    req,
  });
  if (!approval) {
    throw new Error(`La aprobación #${approvalId} no existe.`);
  }
  if (Number(approval.tenant) !== Number(expected.tenantId)) {
    throw new Error('La aprobación pertenece a otro inquilino.');
  }
  if (approval.status === 'consumed') {
    throw new Error(`La aprobación #${approvalId} ya fue consumida por una venta exitosa.`);
  }
  if (approval.status !== 'approved') {
    throw new Error(`La aprobación #${approvalId} no está aprobada (estado: ${approval.status}).`);
  }
  if (isApprovalExpired(approval.expiresAt)) {
    throw new Error(
      `La aprobación #${approvalId} expiró (${APPROVAL_TTL_HOURS} h). Solicite una nueva.`,
    );
  }
  // Binding approval ↔ operación: el input guardado debe ser EXACTAMENTE el
  // que se intenta ejecutar (comparación canónica por JSON estable). El
  // payload guardado tiene la forma { workflow, sourceId, input }.
  const storedShape = (approval.payload ?? {}) as { input?: unknown };
  if (JSON.stringify(storedShape.input ?? null) !== JSON.stringify(expected.input ?? null)) {
    throw new Error(`La aprobación #${approvalId} no corresponde a la operación intentada.`);
  }

  await req.payload.update({
    collection: 'approvals',
    id: approvalId,
    data: { status: 'consumed' },
    req,
  });
}
