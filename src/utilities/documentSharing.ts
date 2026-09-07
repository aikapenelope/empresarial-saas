import crypto from 'crypto';
import { getPayload } from 'payload';
import config from '@payload-config';
import type { DeliveryNote, Quote } from '@/payload-types';

export type ShareableCollection = 'quotes' | 'delivery-notes';

const SHARE_PATH: Record<ShareableCollection, string> = {
  quotes: '/share/quote',
  'delivery-notes': '/share/delivery-note',
};

/** Token de capacidad: 24 bytes del CSPRND en base64url (~192 bits). */
export function generateShareToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export function shareUrlFor(baseUrl: string, collection: ShareableCollection, token: string): string {
  return `${baseUrl.replace(/\/$/, '')}${SHARE_PATH[collection]}/${token}`;
}

/** Documento normalizado para render en email / WhatsApp / página pública. */
export interface SharedLineItem {
  description: string;
  quantity: number;
  unitPriceUSD: number;
  totalUSD: number;
}

export interface SharedDoc {
  kind: 'quote' | 'delivery-note';
  collection: ShareableCollection;
  docTitle: string;
  number: string;
  customerName: string | null;
  issueDate: string | null;
  validUntil: string | null;
  totalUSD: number;
  totalVES: number | null;
  notes: string | null;
  tenantName: string;
  lines: SharedLineItem[];
}

function docTenantName(tenant: Quote['tenant']): string {
  if (tenant && typeof tenant === 'object') return tenant.name;
  return 'Empresarial ERP';
}

function docCustomerName(customer: Quote['customer']): string | null {
  if (customer && typeof customer === 'object') return customer.name;
  return null;
}

export function quoteToSharedDoc(quote: Quote): SharedDoc {
  return {
    kind: 'quote',
    collection: 'quotes',
    docTitle: 'Cotización',
    number: quote.quoteNumber || `COT-${quote.id}`,
    customerName: docCustomerName(quote.customer),
    issueDate: quote.issueDate || null,
    validUntil: quote.validUntil || null,
    totalUSD: Number(quote.totalUSD) || 0,
    totalVES: quote.totalVES == null ? null : Number(quote.totalVES),
    notes: quote.notes || null,
    tenantName: docTenantName(quote.tenant),
    lines: (quote.items || []).map((item) => ({
      description: item.description || item.sku || 'Concepto',
      quantity: Number(item.quantity) || 0,
      unitPriceUSD: Number(item.unitPriceUSD) || 0,
      totalUSD: Number(item.totalUSD) || 0,
    })),
  };
}

export function deliveryNoteToSharedDoc(note: DeliveryNote): SharedDoc {
  return {
    kind: 'delivery-note',
    collection: 'delivery-notes',
    docTitle: 'Remisión de Entrega',
    number: note.noteNumber || `REM-${note.id}`,
    customerName: docCustomerName(note.customer),
    issueDate: note.issueDate || null,
    validUntil: null,
    totalUSD: Number(note.totalUSD) || 0,
    totalVES: note.totalVES == null ? null : Number(note.totalVES),
    notes: note.notes || null,
    tenantName: docTenantName(note.tenant),
    lines: (note.items || []).map((item) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unitPriceUSD) || 0;
      return {
        description: item.description || item.sku || 'Mercancía',
        quantity: qty,
        unitPriceUSD: price,
        totalUSD: Number((qty * price).toFixed(2)),
      };
    }),
  };
}

/**
 * Resuelve el documento compartido por token. Capacidad sin sesión: el token
 * (192 bits del CSPRND) ES el secreto; la búsqueda corre con overrideAccess
 * intencional, ya que la página pública no tiene usuario autenticado.
 */
export async function resolveSharedDocument(
  token: string,
): Promise<{ doc: SharedDoc; shareUrl: string } | null> {
  const payload = await getPayload({ config });
  const base = process.env.PUBLIC_BASE_URL || '';

  const quoteRes = await payload.find({
    collection: 'quotes',
    where: { shareToken: { equals: token } },
    depth: 1,
    limit: 1,
    overrideAccess: true,
  });
  const quote = quoteRes.docs[0];
  if (quote) {
    return {
      doc: quoteToSharedDoc(quote),
      shareUrl: `${base}/share/quote/${token}`,
    };
  }

  const noteRes = await payload.find({
    collection: 'delivery-notes',
    where: { shareToken: { equals: token } },
    depth: 1,
    limit: 1,
    overrideAccess: true,
  });
  const note = noteRes.docs[0];
  if (note) {
    return {
      doc: deliveryNoteToSharedDoc(note),
      shareUrl: `${base}/share/delivery-note/${token}`,
    };
  }

  return null;
}

const fmtDate = (value: string | null): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

const fmtMoney = (value: number): string => `$${value.toFixed(2)}`;
const fmtVes = (value: number): string => `Bs. ${value.toFixed(2)}`;

/** Email HTML autocontenido (inline styles, seguro para clientes de correo). */
export function buildDocumentEmailHtml(doc: SharedDoc, shareUrl: string): string {
  const rows = doc.lines
    .map(
      (line) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;">${escapeHtml(line.description)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;text-align:right;">${line.quantity}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;text-align:right;">${fmtMoney(line.unitPriceUSD)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;text-align:right;font-weight:600;">${fmtMoney(line.totalUSD)}</td>
        </tr>`,
    )
    .join('');

  const validUntilBlock =
    doc.kind === 'quote'
      ? `<p style="margin:4px 0;font-size:14px;color:#475569;">Válida hasta: <strong>${fmtDate(doc.validUntil)}</strong></p>`
      : '';

  const totalVesBlock =
    doc.totalVES != null
      ? `<tr>
           <td style="padding:8px 12px;font-size:14px;text-align:right;color:#64748b;">Tasa del día</td>
           <td style="padding:8px 12px;font-size:15px;text-align:right;">${fmtVes(doc.totalVES)}</td>
         </tr>`
      : '';

  return `<!DOCTYPE html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="background:#0f172a;padding:20px 24px;">
              <div style="color:#ffffff;font-size:18px;font-weight:700;">${escapeHtml(doc.tenantName)}</div>
              <div style="color:#94a3b8;font-size:13px;margin-top:2px;">${doc.docTitle} ${escapeHtml(doc.number)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 4px;font-size:14px;color:#475569;">Estimado cliente,</p>
              <p style="margin:0 0 16px;font-size:14px;color:#475569;">
                ${doc.kind === 'quote' ? 'Adjuntamos el detalle de nuestra cotización' : 'Le compartimos el detalle de la mercancía despachada'}.
              </p>
              <p style="margin:4px 0;font-size:14px;color:#475569;">Cliente: <strong>${escapeHtml(doc.customerName || '—')}</strong></p>
              <p style="margin:4px 0;font-size:14px;color:#475569;">Fecha de emisión: <strong>${fmtDate(doc.issueDate)}</strong></p>
              ${validUntilBlock}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                <thead>
                  <tr style="background:#f8fafc;">
                    <th style="padding:8px 12px;text-align:left;font-size:12px;color:#64748b;text-transform:uppercase;">Descripción</th>
                    <th style="padding:8px 12px;text-align:right;font-size:12px;color:#64748b;text-transform:uppercase;">Cant.</th>
                    <th style="padding:8px 12px;text-align:right;font-size:12px;color:#64748b;text-transform:uppercase;">Precio USD</th>
                    <th style="padding:8px 12px;text-align:right;font-size:12px;color:#64748b;text-transform:uppercase;">Total USD</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
                <tfoot>
                  <tr>
                    <td style="padding:8px 12px;font-size:14px;text-align:right;color:#64748b;" colspan="3">Total</td>
                    <td style="padding:8px 12px;font-size:15px;text-align:right;font-weight:700;">${fmtMoney(doc.totalUSD)}</td>
                  </tr>
                  ${totalVesBlock}
                </tfoot>
              </table>
              ${
                doc.notes
                  ? `<p style="margin:16px 0 0;font-size:13px;color:#64748b;"><strong>Notas:</strong> ${escapeHtml(doc.notes)}</p>`
                  : ''
              }
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                <tr>
                  <td align="center" bgcolor="#4f46e5" style="border-radius:8px;">
                    <a href="${shareUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">
                      Ver ${doc.kind === 'quote' ? 'cotización' : 'remisión'} completa
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;padding:16px 24px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                Documento generado electrónicamente por ${escapeHtml(doc.tenantName)} · Empresarial ERP Bimonetario.
              </p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

/** Mensaje de texto para compartir por WhatsApp (con enlace público). */
export function buildWhatsAppText(doc: SharedDoc, shareUrl: string): string {
  const docLabel = doc.kind === 'quote' ? 'Cotización' : 'Remisión';
  const validLine =
    doc.kind === 'quote' ? `\n*Válida hasta:* ${fmtDate(doc.validUntil)}` : '';
  return [
    `*${docLabel} ${doc.number}* — ${doc.tenantName}`,
    doc.customerName ? `Cliente: ${doc.customerName}` : null,
    `*Total:* ${fmtMoney(doc.totalUSD)}${doc.totalVES != null ? ` / ${fmtVes(doc.totalVES)}` : ''}`,
    validLine,
    `Ver detalle: ${shareUrl}`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
