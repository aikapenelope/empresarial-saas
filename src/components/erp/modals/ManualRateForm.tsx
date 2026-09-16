'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { updateTenantSettingsAction } from '@/actions/erpActions';
import { Loader2, Save } from 'lucide-react';

interface ManualRateFormProps {
  tenantId: number;
  tenantSlug: string;
  tenantName: string;
  manualExchangeRate: number;
  autoSyncRate: boolean;
}

/**
 * Configuración de tasa manual del inquilino (Sprint 21). Reutiliza
 * updateTenantSettingsAction (RBAC: sólo admin) — la vista de tasas muestra
 * los valores; este formulario los cambia.
 */
export function ManualRateForm({
  tenantId,
  tenantSlug,
  tenantName,
  manualExchangeRate,
  autoSyncRate,
}: ManualRateFormProps) {
  const router = useRouter();
  const [rate, setRate] = useState(String(manualExchangeRate || ''));
  const [autoSync, setAutoSync] = useState(autoSyncRate);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await updateTenantSettingsAction({
      tenantId,
      tenantSlug,
      name: tenantName,
      baseCurrency: 'USD',
      manualExchangeRate: rate ? Number(rate) : undefined,
      autoSyncRate: autoSync,
    });
    setLoading(false);
    if (res.success) {
      toast.success('Configuración de tasa actualizada.');
      router.refresh();
    } else {
      toast.error(res.error || 'No se pudo actualizar la configuración.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-xs">
      <label className="flex items-center gap-2 font-semibold text-foreground">
        <input
          type="checkbox"
          checked={autoSync}
          onChange={(e) => setAutoSync(e.target.checked)}
          className="rounded border-border bg-background"
        />
        <span>Sincronizar tasa automáticamente (BCV → Binance → Paralelo)</span>
      </label>

      {!autoSync && (
        <div>
          <label className="block font-semibold text-foreground mb-1">Tasa Manual (Bs. / USD)</label>
          <input
            type="number"
            step="0.0001"
            min="0"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="Ej. 190.50"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground font-mono focus:border-ring focus:outline-none"
          />
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-all disabled:opacity-50"
      >
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        <Save className="h-3.5 w-3.5" />
        <span>Guardar Configuración</span>
      </button>
    </form>
  );
}
