import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Sparkles, Building2, Package, FlaskConical } from 'lucide-react';
import { getTenantBySlug, getIndustryTemplatesCatalog } from '@/utilities/erpData';
import { BUILTIN_TEMPLATES } from '@/utilities/industryTemplates/definitions';
import { Badge } from '@/components/erp/Badge';
import { TemplateApplyButton } from '@/components/erp/TemplateApplyButton';

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function TemplatesPage({ params }: PageProps) {
  const { tenant: tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);

  if (!tenant) {
    notFound();
  }

  const dbTemplates = await getIndustryTemplatesCatalog();
  const dbSlugs = new Set(dbTemplates.map((t) => t.slug));
  const allTemplates = [
    ...dbTemplates,
    ...BUILTIN_TEMPLATES.filter((b) => !dbSlugs.has(b.slug)),
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/${tenantSlug}/erp`}
              className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" />
              Dashboard
            </Link>
            <span className="text-slate-600">/</span>
            <span className="text-xs font-semibold text-indigo-400">Motor de Plantillas</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Plantillas Industriales & Onboarding Atómico
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Siembra instantánea de catálogos, topología de depósitos, recetas BOM y cajas registradoras en un clic.
          </p>
        </div>
      </div>

      {/* Grid de Plantillas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {allTemplates.map((tpl) => {
          const builtinMatch = BUILTIN_TEMPLATES.find((b) => b.slug === tpl.slug);
          const warehousesCount = builtinMatch?.warehouses.length || 2;
          const productsCount = builtinMatch?.products.length || 5;
          const bomsCount = builtinMatch?.boms?.length || 0;

          return (
            <div
              key={tpl.slug}
              className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 backdrop-blur flex flex-col justify-between space-y-6 hover:border-slate-700 transition-all hover:shadow-xl hover:shadow-indigo-500/5"
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <Badge variant="indigo" size="sm">
                    {tpl.industryType || 'Industria'}
                  </Badge>
                </div>

                <div>
                  <h3 className="font-bold text-base text-white">{tpl.name}</h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{tpl.description}</p>
                </div>

                <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-3.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-slate-400" />
                      Almacenes Preconfigurados:
                    </span>
                    <span className="font-semibold text-slate-200">{warehousesCount} depósitos</span>
                  </div>

                  <div className="flex items-center justify-between text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5 text-slate-400" />
                      Catálogo Base:
                    </span>
                    <span className="font-semibold text-slate-200">{productsCount} productos</span>
                  </div>

                  {bomsCount > 0 && (
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <FlaskConical className="h-3.5 w-3.5 text-indigo-400" />
                        Fórmulas BOM:
                      </span>
                      <span className="font-semibold text-indigo-400">{bomsCount} recetas activas</span>
                    </div>
                  )}
                </div>
              </div>

              <TemplateApplyButton slug={tpl.slug} tenantId={tenant.id} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
