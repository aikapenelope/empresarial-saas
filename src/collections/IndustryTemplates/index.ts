import type { CollectionConfig } from 'payload';
import { BUILTIN_TEMPLATES } from '../../utilities/industryTemplates/definitions';
import { isValidTemplateDefinition } from '../../utilities/industryTemplates/validate';
import { extractId } from '../../utilities/cashLedger';

export const IndustryTemplates: CollectionConfig = {
  slug: 'industry-templates',
  labels: {
    singular: 'Plantilla Industrial',
    plural: 'Plantillas Industriales',
  },
  admin: {
    useAsTitle: 'name',
    group: 'Configuración & Catálogos',
    defaultColumns: ['name', 'slug', 'industryType', 'isPublished'],
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
      label: 'Slug Único Identificador',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'description',
      label: 'Descripción de la Industria / Alcance del Negocio',
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
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'defaultPaymentMethods',
      label: 'Métodos de Pago Sugeridos',
      type: 'select',
      hasMany: true,
      options: [
        { label: 'Efectivo Dólares (USD)', value: 'cash_usd' },
        { label: 'Efectivo Bolívares (VES)', value: 'cash_ves' },
        { label: 'Punto de Venta / Tarjeta (VES)', value: 'pos_ves' },
        { label: 'Pago Móvil (VES)', value: 'pago_movil' },
        { label: 'Transferencia Bancaria (VES)', value: 'transfer_ves' },
        { label: 'Zelle (USD)', value: 'zelle' },
        { label: 'Binance Pay / USDT', value: 'binance' },
      ],
    },
    {
      name: 'templateData',
      label: 'Estructura Declarativa de Datos (JSON)',
      type: 'json',
      validate: (val) => isValidTemplateDefinition(val),
    },
  ],
  endpoints: [
    {
      path: '/catalog',
      method: 'get',
      handler: async (req) => {
        if (!req.user) {
          return Response.json({ error: 'No autenticado' }, { status: 401 });
        }

        const dbTemplates = await req.payload.find({
          collection: 'industry-templates',
          where: {
            isPublished: { equals: true },
          },
          pagination: false,
          depth: 0,
          req,
        });

        const builtinSlugs = new Set(dbTemplates.docs.map((d) => d.slug));
        const combined = [
          ...dbTemplates.docs,
          ...BUILTIN_TEMPLATES.filter((b) => !builtinSlugs.has(b.slug)),
        ];

        return Response.json({
          success: true,
          templates: combined,
        });
      },
    },
    {
      path: '/:slug/apply',
      method: 'post',
      handler: async (req) => {
        if (!req.user) {
          return Response.json({ error: 'No autenticado' }, { status: 401 });
        }

        const slug = req.routeParams?.slug;
        if (!slug) {
          return Response.json({ error: 'El slug de la plantilla es requerido.' }, { status: 400 });
        }

        const body = ((await req.json?.()) || {}) as {
          tenantId?: number | string;
          runAsync?: boolean;
        };

        const tenantId = extractId(body.tenantId);
        if (!tenantId) {
          return Response.json({ error: 'El parámetro tenantId es requerido.' }, { status: 400 });
        }

        // Validar autorización RBAC: Sólo super-admin o tenant-admin pueden aprovisionar catálogos
        if (req.user.role !== 'super-admin' && req.user.role !== 'tenant-admin') {
          return Response.json(
            { error: 'Prohibido: Se requieren privilegios de administrador para aplicar plantillas.' },
            { status: 403 },
          );
        }

        if (req.user.role === 'tenant-admin') {
          const userTenants = (
            (req.user as unknown as { tenants?: Array<{ tenant: number | { id: number } }> })
              ?.tenants || []
          ).map((t) =>
            typeof t.tenant === 'object' && t.tenant !== null ? t.tenant.id : t.tenant,
          );

          if (!userTenants.map(String).includes(String(tenantId))) {
            return Response.json(
              { error: 'Prohibido: No tiene permisos de administración en este inquilino.' },
              { status: 403 },
            );
          }
        }

        try {
          // El job se encola (auditoría/reintentos) y se ejecuta INMEDIATAMENTE en esta
          // petición con runByID: en serverless no hay worker de fondo, así que dejarlo
          // únicamente encolado haría que el onboarding nunca arranque.
          const job = await req.payload.jobs.queue({
            task: 'seedIndustryTemplate',
            input: {
              tenantId: typeof tenantId === 'number' ? tenantId : Number(tenantId),
              templateSlug: String(slug),
              userId: Number(req.user.id),
            },
          });

          const run = await req.payload.jobs.runByID({ id: job.id, req });

          const jobStatus = run?.jobStatus?.[String(job.id)]?.status;
          if (jobStatus !== 'success') {
            return Response.json(
              {
                success: false,
                error:
                  'La ejecución del onboarding falló. Consulte el job seedIndustryTemplate para el detalle del error.',
                jobId: job.id,
                jobStatus,
              },
              { status: 500 },
            );
          }

          return Response.json({
            success: true,
            queued: true,
            jobId: job.id,
            message: `La inicialización de la plantilla '${slug}' fue procesada exitosamente para el inquilino ${tenantId}.`,
          });
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : 'Error desconocido al aplicar la plantilla';
          req.payload.logger.error({ err: error }, `Error aplicando plantilla ${slug} al inquilino ${tenantId}`);
          return Response.json({ success: false, error: errorMessage }, { status: 500 });
        }
      },
    },
  ],
  timestamps: true,
};
