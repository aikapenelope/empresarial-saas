import type { TaskConfig } from 'payload';
import { evaluateAlertsForTenant } from '../utilities/alertsEvaluator';

/**
 * Evaluador programado del centro de alertas (Sprint 22). Tarea de SISTEMA:
 * corre sin usuario y con overrideAccess (patrón oficial del Jobs Queue para
 * tareas confiables del servidor). El schedule/autoRun vive en
 * payload.config.ts (`jobs.tasks[].schedule` + `jobs.autoRun`).
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
