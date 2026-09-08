'use server';

import { z } from 'zod';
import { getPayload } from 'payload';
import type { Where } from 'payload';
import { sql } from '@payloadcms/db-postgres';
import config from '@payload-config';
import { headers } from 'next/headers';
import { after } from 'next/server';
import { requireErpTenantAccess } from '@/utilities/erpAuth';
import {
  buildDocumentEmailHtml,
  buildWhatsAppText,
  deliveryNoteToSharedDoc,
  generateShareToken,
  quoteToSharedDoc,
  shareUrlFor,
  type ShareableCollection,
  type SharedDoc,
} from '@/utilities/documentSharing';

/**
 * Sprint 28: compartición de cotizaciones y remisiones por email (Resend,
 * adaptador oficial de Payload) y WhatsApp (enlace wa.me con URL pública).
 *
 * El token de compartición es una CAPACIDAD emitida por el servidor (24 bytes
 * del CSPRNG): se emite perezosamente en el primer envío y viaja en el enlace
 * público /share/{quote|delivery-note}/{token}. La emisión del token usa un
 * compare-and-set SQL (`UPDATE ... WHERE share_token IS NULL RETURNING`) fuera
 * de hooks: dos primeras peticiones concurrentes no pueden pisarse el token —
 * la perdedora releé y devuelve el token ya persistido. La autorización del
 * solicitante se verifica con requireErpTenantAccess + consulta
 * overrideAccess:false antes de cualquier escritura.
 */

const collectionSchema = z.enum(['quotes', 'delivery-notes']);

const ensureShareSchema = z.object({
  collection: collectionSchema,
  tenantId: z.number().int().positive(),
  documentId: z.number().int().positive(),
});

const sendEmailSchema = ensureShareSchema.extend({
  email: z.string().trim().email('Email inválido.').max(200),
});

// SEC: compartir publica un documento — sólo roles con deber comercial.
const SHARE_ROLES = ['super-admin', 'tenant-admin', 'supervisor', 'vendor'] as const;

// Estados finales (inmutables por los hooks de colección): no se emiten tokens
// nuevos ni se reenvían por email; los enlaces ya emitidos siguen resolviendo
// y la página pública muestra el estado final de forma prominente.
const QUOTE_FINAL_STATUSES = new Set(['converted', 'rejected']);
const DELIVERY_NOTE_FINAL_STATUSES = new Set(['voided']);

/**
 * Base URL de los enlaces públicos. PUBLIC_BASE_URL manda: los headers
 * Host/x-forwarded-* llegan del cliente en un Server Action y NO son
 * confiables para construir enlaces enviados por email (host poisoning).
 * El fallback de headers queda sólo para desarrollo local sin la variable.
 */
async function resolveBaseUrl(): Promise<string> {
  const envBase = process.env.PUBLIC_BASE_URL;
  if (envBase) return envBase.replace(/\/$/, '');

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/**
 * Compare-and-set atómico del token: escribe sólo si la columna sigue NULL.
 * Devuelve el token definitivo (el ganado o el ya persistido por otra carrera).
 * UPDATE ... WHERE ... IS NULL RETURNING es atómico en Postgres sin transacción
 * externa; la escritura es infraestructura de compartición (server-generated),
 * por lo que no pasa por los hooks de la colección.
 */
async function atomicEnsureShareToken(
  payload: Awaited<ReturnType<typeof getPayload>>,
  collection: ShareableCollection,
  documentId: number,
): Promise<string> {
  const table = collection === 'quotes' ? 'quotes' : 'delivery_notes';
  const candidate = generateShareToken();

  const dbAdapter = payload.db as unknown as {
    drizzle: { execute: (q: unknown) => Promise<{ rows: Array<Record<string, unknown>> }> };
  };
  const result = await dbAdapter.drizzle.execute(
    sql`UPDATE ${sql.identifier(table)} SET share_token = ${candidate} WHERE id = ${documentId} AND share_token IS NULL RETURNING share_token`,
  );

  if (result.rows.length > 0) {
    return String(result.rows[0].share_token);
  }

  // Perdimos la carrera (o ya existía): releer el token persistido.
  const persisted = await payload.findByID({
    collection,
    id: documentId,
    select: { shareToken: true },
    overrideAccess: true,
  });
  const token = persisted?.shareToken;
  if (!token) {
    throw new Error('No se pudo emitir el enlace de compartición. Intente nuevamente.');
  }
  return token;
}

interface LoadedDoc {
  doc: SharedDoc;
  shareUrl: string;
}

async function loadAndEnsureShare(
  collection: ShareableCollection,
  tenantId: number,
  documentId: number,
  options: { allowFinalWithToken: boolean },
): Promise<LoadedDoc> {
  const payload = await getPayload({ config });
  const user = await requireErpTenantAccess(tenantId, [...SHARE_ROLES]);
  const baseUrl = await resolveBaseUrl();

  const where: Where = { and: [{ id: { equals: documentId } }, { tenant: { equals: tenantId } }] };

  if (collection === 'quotes') {
    const res = await payload.find({
      collection: 'quotes',
      where,
      depth: 1,
      limit: 1,
      user,
      overrideAccess: false,
    });
    const quote = res.docs[0];
    if (!quote) {
      throw new Error('Cotización no encontrada en este inquilino.');
    }

    let token = quote.shareToken || '';
    if (!token) {
      if (QUOTE_FINAL_STATUSES.has(quote.status)) {
        throw new Error(
          quote.status === 'converted'
            ? 'Una cotización convertida a factura ya no puede compartirse.'
            : 'Una cotización rechazada ya no puede compartirse.',
        );
      }
      token = await atomicEnsureShareToken(payload, 'quotes', quote.id);
    } else if (!options.allowFinalWithToken && QUOTE_FINAL_STATUSES.has(quote.status)) {
      throw new Error('La cotización alcanzó un estado final y no puede volver a compartirse.');
    }

    // Releer con el token definitivo para que el doc compartido sea consistente.
    const fresh = token === quote.shareToken ? quote : await payload.findByID({
      collection: 'quotes',
      id: quote.id,
      depth: 1,
      overrideAccess: true,
    });
    return {
      doc: quoteToSharedDoc((fresh ?? quote) as typeof quote),
      shareUrl: shareUrlFor(baseUrl, collection, token),
    };
  }

  const res = await payload.find({
    collection: 'delivery-notes',
    where,
    depth: 1,
    limit: 1,
    user,
    overrideAccess: false,
  });
  const note = res.docs[0];
  if (!note) {
    throw new Error('Remisión no encontrada en este inquilino.');
  }

  let token = note.shareToken || '';
  if (!token) {
    if (DELIVERY_NOTE_FINAL_STATUSES.has(note.status)) {
      throw new Error('Una remisión anulada ya no puede compartirse.');
    }
    token = await atomicEnsureShareToken(payload, 'delivery-notes', note.id);
  } else if (!options.allowFinalWithToken && DELIVERY_NOTE_FINAL_STATUSES.has(note.status)) {
    throw new Error('La remisión fue anulada y no puede volver a compartirse.');
  }

  const fresh = token === note.shareToken ? note : await payload.findByID({
    collection: 'delivery-notes',
    id: note.id,
    depth: 1,
    overrideAccess: true,
  });
  return {
    doc: deliveryNoteToSharedDoc((fresh ?? note) as typeof note),
    shareUrl: shareUrlFor(baseUrl, collection, token),
  };
}

/** Garantiza el token de compartición y devuelve la URL pública + texto de WhatsApp. */
export async function ensureShareUrlAction(input: unknown): Promise<{
  ok: boolean;
  shareUrl?: string;
  whatsappText?: string;
  error?: string;
}> {
  const parsed = ensureShareSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || 'Datos inválidos.' };
  }

  try {
    // Un documento final con token ya emitido conserva su enlace (WhatsApp /
    // copiar siguen sirviendo); sin token, la action rechaza.
    const { doc, shareUrl } = await loadAndEnsureShare(
      parsed.data.collection,
      parsed.data.tenantId,
      parsed.data.documentId,
      { allowFinalWithToken: true },
    );
    return { ok: true, shareUrl, whatsappText: buildWhatsAppText(doc, shareUrl) };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al preparar el enlace.';
    return { ok: false, error: message };
  }
}

/**
 * Prepara el email del documento DENTRO del request (acceso, token, HTML) y
 * devuelve el envío puro diferible — safe para `after()` de Next.js, donde
 * `headers()` ya no está disponible. Compartido por el action manual y el
 * auto-envío del ciclo de venta (Sprint 43).
 */
export async function prepareDocumentEmail(
  collection: ShareableCollection,
  tenantId: number,
  documentId: number,
  email: string,
): Promise<{ shareUrl: string; whatsappText: string; send: () => Promise<void> }> {
  // No se reenvían por email documentos en estado final (anulada/rechazada/
  // convertida): el mail sería una versión desactualizada del ciclo de vida.
  const { doc, shareUrl } = await loadAndEnsureShare(collection, tenantId, documentId, {
    allowFinalWithToken: false,
  });
  const html = buildDocumentEmailHtml(doc, shareUrl);
  const subject = `${doc.docTitle} ${doc.number} — ${doc.tenantName}`;
  const whatsappText = buildWhatsAppText(doc, shareUrl);

  const send = async (): Promise<void> => {
    const payload = await getPayload({ config });
    await payload.sendEmail({ to: email, subject, html });

    if (doc.kind === 'quote') {
      // Primer envío: transición draft -> sent (visible en el listado).
      const res = await payload.find({
        collection: 'quotes',
        where: { and: [{ id: { equals: documentId } }, { tenant: { equals: tenantId } }] },
        depth: 0,
        limit: 1,
        overrideAccess: true,
      });
      const quote = res.docs[0];
      if (quote && quote.status === 'draft') {
        await payload.update({
          collection: 'quotes',
          id: quote.id,
          data: { status: 'sent' },
          overrideAccess: true,
        });
      }
    }
  };

  return { shareUrl, whatsappText, send };
}

/** Envía el documento por email. El envío (Resend) corre en after() de Next.js. */
export async function sendDocumentEmailAction(input: unknown): Promise<{
  ok: boolean;
  shareUrl?: string;
  whatsappText?: string;
  error?: string;
}> {
  const parsed = sendEmailSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || 'Datos inválidos.' };
  }

  try {
    const { shareUrl, whatsappText, send } = await prepareDocumentEmail(
      parsed.data.collection,
      parsed.data.tenantId,
      parsed.data.documentId,
      parsed.data.email,
    );

    // AGENTS §3: el envío de email en serverless corre dentro de after() de
    // Next.js para no bloquear (ni suspender con) la respuesta del action.
    await after(send);

    return { ok: true, shareUrl, whatsappText };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al enviar el email.';
    return { ok: false, error: message };
  }
}
