import type { TaskConfig } from 'payload';
import { evaluateAlertsForTenant } from '../utilities/alertsEvaluator';

/**
 * Evaluador programado del centro de alertas (Sprint 22). Tarea de SISTEMA:
 * corre sin usuario y con overrideAccess (patrón oficial del Jobs Queue para
 * tareas confiables del servidor).
 *
 * Sprint R5: se conserva el `schedule` declarativo — es lo que habilita el
 * scheduling NATIVO de Payload (`jobs.scheduling` + global de stats + el endpoint
 * `/api/payload-jobs/handle-schedules`). Lo que NO se usa es `jobs.autoRun` (cron
 * in-process, no fiable en Vercel serverless): el disparo real lo hace un cron
 * externo (Vercel Cron) contra `GET /api/payload-jobs/run`.
 */
export const evaluateAlertsTask: TaskConfig<'evaluateAlerts'> = {
  slug: 'evaluateAlerts',
  schedule: [
    {
      cron: '*/15 * * * *', // cada 15 minutos
      queue: 'alerts',
    },
  ],
  inputSchema: [],
  outputSchema: [
    { name: 'tenants', type: 'number', required: true },
    { name: 'created', type: 'number', required: true },
    { name: 'updated', type: 'number', required: true },
    { name: 'resolved', type: 'number', required: true },
  ],
  retries: 1,
  handler: async ({ req }) => {
    const tenantsRes = await req.payload.find({
      collection: 'tenants',
      pagination: false,
      depth: 0,
      req,
    });

    let created = 0;
    let updated = 0;
    let resolved = 0;

    for (const tenant of tenantsRes.docs) {
      try {
        const result = await evaluateAlertsForTenant(req.payload, tenant.id, req);
        created += result.created;
        updated += result.updated;
        resolved += result.resolved;
        if (result.created > 0 || result.reactivated > 0) {
          // Digest anti-spam (IE-PR4): un job por inquilino con alertas nuevas
          // o reactivadas. El propio job filtra las aún no notificadas, así
          // que encolar de más es inofensivo.
          await req.payload.jobs.queue({
            task: 'notifyAlertsEmail',
            input: { tenantId: tenant.id },
            queue: 'alerts',
          });
        }
      } catch (error: unknown) {
        // Un inquilino con datos inconsistentes no debe abortar el resto:
        // se registra y se continúa; el reintento del job lo cubrirá.
        console.error(`[evaluateAlerts] tenant ${tenant.id}:`, error);
      }
    }

    return {
      output: { tenants: tenantsRes.docs.length, created, updated, resolved },
    };
  },
};
