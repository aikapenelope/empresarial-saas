import { sql } from '@payloadcms/db-postgres';
import type { Payload } from 'payload';
import {
  generateShareToken,
  shareTokenExpiry,
  type ShareableCollection,
} from './documentSharing';

/**
 * ─── Emisión del token de compartición (Sprint R4 + ronda Devin #89) ────────
 *
 * Escritura cruda (no Local API) porque los campos `shareToken*` están bloqueados
 * a nivel de campo en las colecciones (access create/update = false): la emisión
 * es infraestructura del servidor, no una edición de usuario.
 */

/** Tabla física de una colección compartible (para las escrituras crudas). */
export function shareTableFor(collection: ShareableCollection): string {
  return collection === 'quotes'
    ? 'quotes'
    : collection === 'invoices'
      ? 'invoices'
      : 'delivery_notes';
}

/**
 * Garantiza un token de compartición **vigente** en un solo UPDATE atómico:
 *
 *  - `share_token IS NULL`            → emite token nuevo + caducidad.
 *  - `share_token` y sin caducidad    → token LEGADO: CONSERVA el token y le
 *    acuña caducidad (no rompe los enlaces ya distribuidos).
 *  - caducidad ya vencida             → ROTA token + caducidad (el enlace viejo
 *    ya no resuelve; se entrega uno nuevo vigente).
 *  - token vigente y sin vencer       → no-op (mantiene ambos).
 *
 * La concurrencia la serializa el row lock: dos peticiones simultáneas sobre un
 * token vencido escriben la MISMA fila y la segunda relee lo ya persistido, de
 * modo que todas reciben un único token actual. Devuelve el token definitivo.
 *
 * Reporte Devin #89: antes el llamador sólo invocaba esta operación cuando
 * faltaba el token, así que los legados nunca recibían caducidad y un enlace
 * vencido se seguía devolviendo (404 para el destinatario).
 */
export async function ensureShareToken(
  payload: Payload,
  collection: ShareableCollection,
  documentId: number,
): Promise<string> {
  const table = shareTableFor(collection);
  const candidate = generateShareToken();
  const expiresAt = shareTokenExpiry();

  const dbAdapter = payload.db as unknown as {
    drizzle: { execute: (q: unknown) => Promise<{ rows: Array<Record<string, unknown>> }> };
  };

  const result = await dbAdapter.drizzle.execute(
    sql`UPDATE ${sql.identifier(table)}
        SET share_token = CASE
              WHEN share_token IS NULL THEN ${candidate}
              WHEN share_token_expires_at IS NOT NULL AND share_token_expires_at <= now() THEN ${candidate}
              ELSE share_token
            END,
            share_token_expires_at = CASE
              WHEN share_token IS NULL THEN ${expiresAt}
              WHEN share_token_expires_at IS NULL THEN ${expiresAt}
              WHEN share_token_expires_at <= now() THEN ${expiresAt}
              ELSE share_token_expires_at
            END
        WHERE id = ${documentId}
        RETURNING share_token`,
  );

  const token = result.rows[0]?.share_token;
  if (!token) {
    throw new Error('No se pudo emitir el enlace de compartición. Intente nuevamente.');
  }
  return String(token);
}
