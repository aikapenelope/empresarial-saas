import type { TaskConfig } from 'payload';
import { applyIndustryTemplateToTenant } from '../utilities/industryTemplates/seeder';

export const seedIndustryTemplateTask: TaskConfig<'seedIndustryTemplate'> = {
  slug: 'seedIndustryTemplate',
  inputSchema: [
    { name: 'tenantId', type: 'number', required: true },
    { name: 'templateSlug', type: 'text', required: true },
  ],
  outputSchema: [
    { name: 'success', type: 'checkbox', required: true },
    { name: 'message', type: 'text', required: true },
    { name: 'templateName', type: 'text', required: true },
  ],
  retries: 1,
  handler: async ({ input, req }) => {
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
