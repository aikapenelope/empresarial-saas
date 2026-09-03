import type { CollectionConfig } from 'payload';
import { BUILTIN_TEMPLATES } from '../templates/definitions';
import { applyIndustryTemplateToTenant } from '../templates/seeder';

export const IndustryTemplates: CollectionConfig = {
  slug: 'industry-templates',
  labels: {
    singular: 'Plantilla Industrial',
    plural: 'Plantillas de Industria (Templates)',
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'industryType', 'isPublished'],
    group: 'Administración',
  },
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) => Boolean(user?.role === 'super-admin'),
    update: ({ req: { user } }) => Boolean(user?.role === 'super-admin'),
    delete: ({ req: { user } }) => Boolean(user?.role === 'super-admin'),
  },
  fields: [
    {
      name: 'name',
      label: 'Nombre de la Plantilla',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'slug',
      label: 'Slug Único',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'description',
      label: 'Descripción del Negocio / Alcance',
      type: 'textarea',
      required: true,
    },
    {
      name: 'industryType',
      label: 'Tipo de Industria',
      type: 'select',
      required: true,
      options: [
        { label: 'Producción de Alimentos / Panadería (BOM)', value: 'food_production' },
        { label: 'Farmacia / Retail Salud', value: 'retail_health' },
        { label: 'Distribución Mayorista / Consumo Masivo', value: 'wholesale' },
        { label: 'Servicios & Talleres', value: 'services' },
      ],
    },
    {
      name: 'icon',
      label: 'Icono Lucide',
      type: 'text',
      defaultValue: 'Sparkles',
    },
    {
      name: 'isPublished',
      label: 'Publicado y Disponible para Inquilinos',
      type: 'checkbox',
      defaultValue: true,
    },
  ],
  endpoints: [
    {
      path: '/',
      method: 'get',
      handler: async () => {
        return Response.json({
          templates: BUILTIN_TEMPLATES,
        });
      },
    },
    {
      path: '/:slug/apply',
      method: 'post',
      handler: async (req) => {
        const slug = req.routeParams?.slug;
        if (!slug) {
          return Response.json({ error: 'Template slug is required' }, { status: 400 });
        }

        const body = (await req.json?.()) || {};
        const tenantId = body.tenantId;

        if (!tenantId) {
          return Response.json({ error: 'tenantId is required in request body' }, { status: 400 });
        }

        try {
          const result = await applyIndustryTemplateToTenant({
            tenantId,
            templateSlug: String(slug),
            req,
          });

          return Response.json(result);
        } catch (error: any) {
          req.payload.logger.error({ err: error }, `Error applying template ${slug} to tenant ${tenantId}`);
          return Response.json(
            { error: error?.message || 'Failed to apply industry template' },
            { status: 500 },
          );
        }
      },
    },
  ],
};
