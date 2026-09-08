import React from 'react';
import { notFound } from 'next/navigation';
import { Sparkles, Building2, Package, FlaskConical } from 'lucide-react';
import { getTenantBySlug, getIndustryTemplatesCatalog } from '@/utilities/erpData';
import { BUILTIN_TEMPLATES } from '@/utilities/industryTemplates/definitions';
import { Badge } from '@/components/erp/Badge';
import { ErpPageHeader } from '@/components/erp/ErpPageHeader';
import { TemplateApplyButton } from '@/components/erp/TemplateApplyButton';
import { Card } from '@/components/ui/card';
import { ErpAccessError, requireErpTenantAccess } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function TemplatesPage({ params }: PageProps) {
  const { tenant: tenantSlug } = await params;
  let tenant: Awaited<ReturnType<typeof getTenantBySlug>> = null;
  try {
    tenant = await getTenantBySlug(tenantSlug);
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  if (!tenant) {
    notFound();
  }

  try {
    await requireErpTenantAccess(tenant.id);
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  const dbTemplates = await getIndustryTemplatesCatalog();
  const dbSlugs = new Set(dbTemplates.map((t) => t.slug));
  const allTemplates = [
    ...dbTemplates,
    ...BUILTIN_TEMPLATES.filter((b) => !dbSlugs.has(b.slug)),
  ];

  return (
    <div className="space-y-6">
      <ErpPageHeader
        title="Plantillas Industriales & Onboarding Atómico"
        description="Siembra instantánea de catálogos, topología de depósitos, recetas BOM y cajas registradoras en un clic."
        breadcrumbHref={`/${tenantSlug}/erp`}
        section="Motor de Plantillas"
      />

      {/* Grid de Plantillas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {allTemplates.map((tpl) => {
          const builtinMatch = BUILTIN_TEMPLATES.find((b) => b.slug === tpl.slug);
          const warehousesCount = builtinMatch?.warehouses.length || 2;
          const productsCount = builtinMatch?.products.length || 5;
          const bomsCount = builtinMatch?.boms?.length || 0;

          return (
            <Card
              key={tpl.slug}
              className="rounded-2xl p-6 flex flex-col justify-between space-y-6 hover:border-muted-foreground/30 transition-all hover:shadow-lg"
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-foreground border border-border">
                    <Sparkles className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <Badge variant="indigo" size="sm">
                    {tpl.industryType || 'Industria'}
                  </Badge>
                </div>

                <div>
                  <h3 className="font-bold text-base text-foreground">{tpl.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{tpl.description}</p>
                </div>

                <div className="rounded-xl border border-border bg-muted/40 p-3.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Almacenes Preconfigurados:
                    </span>
                    <span className="font-semibold text-foreground">{warehousesCount} depósitos</span>
                  </div>

                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5" aria-hidden="true" />
                      Catálogo Base:
                    </span>
                    <span className="font-semibold text-foreground">{productsCount} productos</span>
                  </div>

                  {bomsCount > 0 && (
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
                        Fórmulas BOM:
                      </span>
                      <span className="font-semibold text-foreground">{bomsCount} recetas activas</span>
                    </div>
                  )}
                </div>
              </div>

              <TemplateApplyButton slug={tpl.slug} tenantId={tenant.id} />
            </Card>
          );
        })}
      </div>
    </div>
  );
}
