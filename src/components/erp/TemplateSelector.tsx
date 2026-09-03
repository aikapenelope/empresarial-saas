'use client';

import React, { useState } from 'react';
import { Sparkles, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';

interface TemplateSelectorProps {
  tenantSlug: string;
}

const templates = [
  {
    name: 'Panadería & Pastelería (BOM)',
    slug: 'bakery-production',
    description: 'Catálogo de materias primas (harinas, levaduras), recetas BOM listas con mano de obra y almacenes de producción.',
    badge: 'Producción & BOM',
    color: 'from-amber-500/20 to-orange-500/10 border-amber-500/30',
  },
  {
    name: 'Farmacia & Retail Salud',
    slug: 'pharmacy-retail',
    description: 'Medicamentos categorizados por especialidad médica, control de inventario crítico y puntos de venta.',
    badge: 'Retail & POS',
    color: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/30',
  },
  {
    name: 'Distribuidora Mayorista',
    slug: 'wholesale-distribution',
    description: 'Venta por fardos/bultos, tarifas mayoristas diferenciadas y galpones logísticos de despacho masivo.',
    badge: 'B2B Masivo',
    color: 'from-blue-500/20 to-indigo-500/10 border-blue-500/30',
  },
];

export function TemplateSelector({ tenantSlug }: TemplateSelectorProps) {
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleApply = async (slug: string) => {
    setLoadingSlug(slug);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      // Aplicar plantilla mediante el endpoint nativo del plugin
      const res = await fetch(`/api/industry-templates/${slug}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: tenantSlug }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al aplicar plantilla');
      }

      setSuccessMessage(`¡Plantilla aplicada exitosamente! Se crearon ${data.stats?.productsCreated || 0} productos y ${data.stats?.bomsCreated || 0} fórmulas BOM.`);
    } catch (err: any) {
      setErrorMessage(err.message || 'No se pudo conectar con el servidor.');
    } finally {
      setLoadingSlug(null);
    }
  };

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 backdrop-blur-xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold uppercase tracking-wider mb-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Acelerador de Configuración Industrial</span>
          </div>
          <h2 className="text-xl font-bold text-zinc-100">Siembra de Datos en 1 Clic (Estilo Supasheet)</h2>
          <p className="text-sm text-zinc-400 mt-1">
            Selecciona la industria de tu empresa para preconfigurar almacenes, categorías, insumos y fórmulas de fabricación.
          </p>
        </div>
      </div>

      {successMessage && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
          {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {templates.map((tpl) => {
          const isLoading = loadingSlug === tpl.slug;
          return (
            <div
              key={tpl.slug}
              className={`p-5 rounded-xl border bg-gradient-to-br flex flex-col justify-between transition-all hover:scale-[1.01] ${tpl.color}`}
            >
              <div>
                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-zinc-900/80 text-zinc-300 border border-zinc-700/50 mb-3">
                  {tpl.badge}
                </span>
                <h3 className="font-bold text-base text-zinc-100 mb-2">{tpl.name}</h3>
                <p className="text-xs text-zinc-400 leading-relaxed mb-4">{tpl.description}</p>
              </div>

              <button
                onClick={() => handleApply(tpl.slug)}
                disabled={isLoading || Boolean(loadingSlug)}
                className="w-full py-2.5 px-4 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-semibold text-zinc-200 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    <span>Sembrando datos...</span>
                  </>
                ) : (
                  <>
                    <span>Aplicar a esta Empresa</span>
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
