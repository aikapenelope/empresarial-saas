'use client';

import React, { useState } from 'react';
import { Sparkles, Check, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface TemplateApplyButtonProps {
  slug: string;
  tenantId: number;
}

export function TemplateApplyButton({ slug, tenantId }: TemplateApplyButtonProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleApply = async () => {
    if (!confirm('¿Deseas aplicar esta plantilla a tu empresa? Se sembrarán los almacenes, categorías, productos y recetas iniciales.')) {
      return;
    }

    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch(`/api/industry-templates/${slug}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al aplicar plantilla');
      }

      setMessage(data.message || 'Plantilla aplicada exitosamente.');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al aplicar la plantilla.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={handleApply}
        disabled={loading}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-xs font-semibold transition-all shadow-sm"
      >
        {loading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Aplicando plantilla...</span>
          </>
        ) : (
          <>
            <Sparkles className="h-3.5 w-3.5" />
            <span>Aplicar a esta Empresa</span>
          </>
        )}
      </button>

      {message && (
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2 text-[11px] text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2 text-[11px] text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
