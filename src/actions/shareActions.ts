'use server';

import { z } from 'zod';
import { getPayload } from 'payload';
import type { Where } from 'payload';
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
 * público /share/{quote|delivery-note}/{token}. La emisión del token es la
 * única escritura con overrideAccess del flujo: el valor lo genera el propio
 * servidor (nunca entra dato de usuario) y la autorización del solicitante ya
 * quedó verificada con requireErpTenantAccess + consulta overrideAccess:false.
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

async function resolveBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

interface LoadedDoc {
  doc: SharedDoc;
  shareUrl: string;
  token: string;
}

async function loadAndEnsureShare(
  collection: ShareableCollection,
  tenantId: number,
  documentId: number,
): Promise<LoadedDoc> {
  const payload = await getPayload({ config });
  const user = await requireErpTenantAccess(tenantId);
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
      token = generateShareToken();
      // Escritura interna del token (server-generated, ver comentario del módulo).
      const updated = await payload.update({
        collection: 'quotes',
        id: quote.id,
        data: { shareToken: token },
        overrideAccess: true,
        context: { viaShareActions: true },
      });
      return { doc: quoteToSharedDoc(updated as typeof quote), shareUrl: shareUrlFor(baseUrl, collection, token), token };
    }
    return { doc: quoteToSharedDoc(quote), shareUrl: shareUrlFor(baseUrl, collection, token), token };
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
    token = generateShareToken();
    const updated = await payload.update({
      collection: 'delivery-notes',
      id: note.id,
      data: { shareToken: token },
      overrideAccess: true,
      context: { viaShareActions: true },
    });
    return {
      doc: deliveryNoteToSharedDoc(updated as typeof note),
      shareUrl: shareUrlFor(baseUrl, collection, token),
      token,
    };
  }
  return { doc: deliveryNoteToSharedDoc(note), shareUrl: shareUrlFor(baseUrl, collection, token), token };
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
    const { doc, shareUrl } = await loadAndEnsureShare(
      parsed.data.collection,
      parsed.data.tenantId,
      parsed.data.documentId,
    );
    return { ok: true, shareUrl, whatsappText: buildWhatsAppText(doc, shareUrl) };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al preparar el enlace.';
    return { ok: false, error: message };
  }
}

/** Envía el documento por email. El envío (Resend) corre en after() de Next.js: */
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
    const { doc, shareUrl } = await loadAndEnsureShare(
      parsed.data.collection,
      parsed.data.tenantId,
      parsed.data.documentId,
    );
    const html = buildDocumentEmailHtml(doc, shareUrl);
    const subject = `${doc.docTitle} ${doc.number} — ${doc.tenantName}`;
    const whatsappText = buildWhatsAppText(doc, shareUrl);
    const { tenantId, documentId, email } = parsed.data;

    // AGENTS §3: el envío de email en serverless corre dentro de after() de
    // Next.js para no bloquear (ni suspender con) la respuesta del action.
    await after(async () => {
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
          context: { viaShareActions: true },
        });
        const quote = res.docs[0];
        if (quote && quote.status === 'draft') {
          await payload.update({
            collection: 'quotes',
            id: quote.id,
            data: { status: 'sent' },
            overrideAccess: true,
            context: { viaShareActions: true },
          });
        }
      }
    });

    return { ok: true, shareUrl, whatsappText };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al enviar el email.';
    return { ok: false, error: message };
  }
}
