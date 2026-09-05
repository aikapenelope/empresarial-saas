import type { TaskConfig } from 'payload';
import { applyIndustryTemplateToTenant } from '../utilities/industryTemplates/seeder';

/**
 * Worker de onboarding por plantilla. Los jobs se ejecutan en un contexto sin usuario,
 * por lo que el `userId` del solicitante viaja en el input y se rehidrata aquí: el seeder
 * corre con `overrideAccess: false` y evalúa el RBAC real contra ese usuario, en lugar de
 * confiar en escrituras privilegiadas anónimas.
 */
export const seedIndustryTemplateTask: TaskConfig<'seedIndustryTemplate'> = {
  slug: 'seedIndustryTemplate',
  inputSchema: [
    { name: 'tenantId', type: 'number', required: true },
    { name: 'templateSlug', type: 'text', required: true },
    { name: 'userId', type: 'number', required: true },
  ],
  outputSchema: [
    { name: 'success', type: 'checkbox', required: true },
    { name: 'message', type: 'text', required: true },
    { name: 'templateName', type: 'text', required: true },
  ],
  retries: 1,
  handler: async ({ input, req }) => {
    const initiatingUser = await req.payload.findByID({
      collection: 'users',
      id: input.userId,
      depth: 0,
      req,
    });

    if (!initiatingUser) {
      throw new Error(
        `El usuario ${input.userId} que solicitó el onboarding ya no existe. Job cancelado.`,
      );
    }

    if (initiatingUser.role !== 'super-admin' && initiatingUser.role !== 'tenant-admin') {
      throw new Error(
        'El usuario solicitante no tiene privilegios de administrador para aplicar plantillas.',
      );
    }

    req.user = initiatingUser as typeof req.user;

    const result = await applyIndustryTemplateToTenant({
      tenantId: input.tenantId,
      templateSlug: input.templateSlug,
      req,
    });

    return {
      output: {
        success: result.success,
        message: result.message,
        templateName: result.templateName,
      },
    };
  },
};
