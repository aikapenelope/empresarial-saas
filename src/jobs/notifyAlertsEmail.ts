import type { TaskConfig } from 'payload';
import { sql } from '@payloadcms/db-postgres';
import { getActiveDb } from '../utilities/inventoryLedger';

/**
 * Digest anti-spam de alertas (IE-PR4): un solo email por ciclo con las
 * alertas activas warning/critical aún no notificadas (notifiedAt null).
 *
 * - Se encola desde `evaluateAlertsTask` SOLO cuando el inquilino tuvo alertas
 *   nuevas o reactivadas; corre en la misma queue `alerts` del Jobs Queue.
 * - OFF por inquilino (`emailConfig.alertsEmailEnabled`, default false) hasta
 *   que verifique su dominio en Resend.
 * - Idempotente ante retries: cada alerta se estampa `notifiedAt` sólo
 *   DESPUÉS de un envío exitoso — un reintento reprocesa únicamente las
 *   pendientes, nunca duplica las ya notificadas.
 * - Destinatarios: `emailConfig.alertsEmailRecipients` o, si está vacío, los
 *   emails de los tenant-admin del inquilino (fallback).
 * - Tarea de SISTEMA: corre sin usuario y con overrideAccess implícito de la
 *   Local API (patrón oficial para jobs confiables del servidor).
 */
export const notifyAlertsEmailTask: TaskConfig<'notifyAlertsEmail'> = {
  slug: 'notifyAlertsEmail',
  inputSchema: [{ name: 'tenantId', type: 'number', required: true }],
  outputSchema: [
    { name: 'sent', type: 'checkbox', required: true },
    { name: 'notified', type: 'number', required: true },
  ],
  retries: 2,
  handler: async ({ req, input }) => {
    const tenant = await req.payload.findByID({
      collection: 'tenants',
      id: input.tenantId,
      depth: 0,
      req,
    });

    if (!tenant.emailConfig?.alertsEmailEnabled) {
      return { output: { sent: false, notified: 0 } };
    }

    const pendingRes = await req.payload.find({
      collection: 'alerts',
      where: {
        and: [
          { tenant: { equals: input.tenantId } },
          { notifiedAt: { exists: false } },
          { resolvedAt: { exists: false } },
          { severity: { in: ['warning', 'critical'] } },
        ],
      },
      pagination: false,
      depth: 0,
      req,
    });

    const pending = pendingRes.docs;
    if (pending.length === 0) {
      return { output: { sent: false, notified: 0 } };
    }

    // Destinatarios explícitos o fallback a los tenant-admin del inquilino.
    let recipients = (tenant.emailConfig?.alertsEmailRecipients ?? [])
      .map((r) => r.email)
      .filter((email) => typeof email === 'string' && email.includes('@'));
    if (recipients.length === 0) {
      const admins = await req.payload.find({
        collection: 'users',
        where: {
          and: [
            { role: { equals: 'tenant-admin' } },
            { 'tenants.tenant': { equals: input.tenantId } },
          ],
        },
        pagination: false,
        depth: 0,
        req,
      });
      recipients = admins.docs.map((u) => u.email).filter(Boolean);
    }
    if (recipients.length === 0) {
      return { output: { sent: false, notified: 0 } };
    }

    // El digest no puede confiar en headers (no hay request): sólo la variable
    // de entorno pública, mismo criterio anti host-poisoning de shareActions.
    const appUrl = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
    // Escape HTML (Devin #80 🟥): tenant.name y los mensajes son datos de
    // usuario — nunca van interpolados crudos al HTML del digest.
    const escapeHtml = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const alertLines = pending.map(
      (a) => `• [${a.severity.toUpperCase()}] ${a.message}`,
    );
    const linkBlock = appUrl ? `\n\n<center><a href="${appUrl}/${tenant.slug}/erp/alerts">Abrir el centro de alertas</a></center>` : '';

    await req.payload.sendEmail({
      to: recipients.join(', '),
      subject: `[ERP] ${pending.length} alerta(s) nueva(s) — ${tenant.name}`,
      html: `
        <p>Hola, el inquilino <strong>${escapeHtml(tenant.name)}</strong> tiene <strong>${pending.length}</strong> alerta(s) nueva(s):</p>
        <ul>${alertLines.map((line) => `<li style="margin-bottom:6px;">${escapeHtml(line)}</li>`).join('')}</ul>
        ${linkBlock}
      `,
      text: `${alertLines.join('\n')}${appUrl ? `\n\n${appUrl}/${tenant.slug}/erp/alerts` : ''}`,
    });

    // Estampado POSTERIOR al envío y ATÓMICO (Devin #80): una sola sentencia
    // marca todas las alertas del digest — la ventana de crash entre el envío
    // y el estampado queda reducida a un statement (el escenario de duplicado
    // por updates secuenciales desaparece). Si el proceso muere justo en esa
    // ventana, el reintento puede re-enviar el digest: se prefiere un duplicado
    // a perder una alerta crítica (at-least-once); el outbox durable queda como
    // hardening v2.
    const db = getActiveDb(req);
    await db.execute(sql`
      UPDATE alerts
      SET notified_at = now(), updated_at = now()
      WHERE id IN (${sql.join(
        pending.map((a) => sql`${a.id}`),
        sql`, `,
      )})
    `);

    return { output: { sent: true, notified: pending.length } };
  },
};
