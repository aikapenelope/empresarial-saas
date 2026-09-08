'use client';

import React, { useState } from 'react';
import { updateTenantSettingsAction } from '@/actions/erpActions';
import { formatVES } from './format';
import { Building2, Coins, CheckCircle2, FileText, Loader2, RefreshCw } from 'lucide-react';
import { ErpPageHeader } from './ErpPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from './Badge';

interface SettingsViewProps {
  tenant: {
    id: number;
    name: string;
    slug: string;
    rifFiscal?: string | null;
    phone?: string | null;
    currencyConfig?: {
      baseCurrency?: ('USD' | 'VES') | null;
      manualExchangeRate?: number | null;
      autoSyncRate?: boolean | null;
    } | null;
    salesConfig?: {
      salesDocumentDefault?: ('nota_entrega' | 'factura') | null;
    } | null;
  };
  effectiveRate: number;
  bcvRate: number | null;
  rateSource: string;
}

export function SettingsView({
  tenant,
  effectiveRate,
  bcvRate,
  rateSource,
}: SettingsViewProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [name, setName] = useState(tenant.name || '');
  const [rifFiscal, setRifFiscal] = useState(tenant.rifFiscal || '');
  const [phone, setPhone] = useState(tenant.phone || '');
  const [baseCurrency, setBaseCurrency] = useState<'USD' | 'VES'>(
    tenant.currencyConfig?.baseCurrency || 'USD',
  );
  const [autoSyncRate, setAutoSyncRate] = useState<boolean>(
    tenant.currencyConfig?.autoSyncRate ?? true,
  );
  const [salesDocumentDefault, setSalesDocumentDefault] = useState<'nota_entrega' | 'factura'>(
    tenant.salesConfig?.salesDocumentDefault ?? 'factura',
  );
  const [manualExchangeRate, setManualExchangeRate] = useState<number>(
    tenant.currencyConfig?.manualExchangeRate || 0,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const res = await updateTenantSettingsAction({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      name,
      rifFiscal,
      phone,
      baseCurrency,
      manualExchangeRate,
      autoSyncRate,
      salesDocumentDefault,
    });

    setLoading(false);

    if (res.success) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } else {
      setError(res.error || 'Error al actualizar configuración');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <ErpPageHeader
        title="Ajustes de Empresa & Parámetros Bimonetarios"
        description="Personaliza los datos fiscales, WhatsApp de cobranzas y la política de tasa de cambio de tu organización."
        breadcrumbHref={`/${tenant.slug}/erp`}
        section="Configuración"
      />

      {success && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-emerald-600 dark:text-emerald-400 text-xs font-semibold animate-in fade-in" role="status">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>¡Configuración de la empresa guardada y aplicada exitosamente!</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-4 text-rose-600 dark:text-rose-400 text-xs" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 text-xs">
        {/* Sección 0: Documento de Venta por Defecto (Sprint 41) */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">Documento de Venta por Defecto</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <div>
              <label htmlFor="sales-doc-default" className="block font-semibold text-foreground mb-1">
                Documento de Entrega al Cliente
              </label>
              <select
                id="sales-doc-default"
                value={salesDocumentDefault}
                onChange={(e) => setSalesDocumentDefault(e.target.value as 'nota_entrega' | 'factura')}
                className="w-full h-9 rounded-md border border-border bg-card px-2 text-xs"
              >
                <option value="nota_entrega">Nota de Entrega (factura opcional)</option>
                <option value="factura">Factura inmediata</option>
              </select>
              <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                En modo Nota de Entrega, las entregas se documentan sin factura (escenario regulatorio 2026);
                la factura se emite después desde la remisión o el pedido, sólo cuando el cliente la pida.
              </p>
            </div>
          </div>
        </Card>

        {/* Sección 1: Datos Fiscales y de Contacto */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">Identificación Fiscal & Corporativa</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-foreground mb-1" htmlFor="tenant-name">
                Razón Social / Nombre Comercial *
              </label>
              <Input
                id="tenant-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <label className="block font-semibold text-foreground mb-1" htmlFor="tenant-rif">
                RIF / Cédula Fiscal
              </label>
              <Input
                id="tenant-rif"
                type="text"
                value={rifFiscal}
                onChange={(e) => setRifFiscal(e.target.value)}
                placeholder="Ej. J-12345678-0"
                className="font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-foreground mb-1" htmlFor="tenant-phone">
                WhatsApp Oficial de Cobranzas / Teléfono
              </label>
              <Input
                id="tenant-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ej. +584121234567"
                className="font-mono"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Utilizado para generar los enlaces de cobro automático con mensajes estructurados.
              </p>
            </div>

            <div>
              <label className="block font-semibold text-foreground mb-1" htmlFor="tenant-slug">
                Identificador URL (Slug)
              </label>
              <Input
                id="tenant-slug"
                type="text"
                disabled
                value={tenant.slug}
                className="font-mono cursor-not-allowed"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Identificador permanente del inquilino multi-tenant.
              </p>
            </div>
          </div>
        </Card>

        {/* Sección 2: Configuración Bimonetaria y Tasa */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <Coins className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">Política Cambiaria & Moneda Base</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-foreground mb-1" htmlFor="tenant-currency">
                Moneda Base Contable
              </label>
              <select
                id="tenant-currency"
                value={baseCurrency}
                onChange={(e) => setBaseCurrency(e.target.value as 'USD' | 'VES')}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground"
              >
                <option value="USD">Dólar Estadounidense (USD $)</option>
                <option value="VES">Bolívar Soberano (VES Bs.)</option>
              </select>
              <p className="text-[10px] text-muted-foreground mt-1">
                Moneda de consolidación de balances deudores y métricas financieras.
              </p>
            </div>

            <div className="flex flex-col justify-center space-y-2 pt-1">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="autoSyncRate"
                  checked={autoSyncRate}
                  onChange={(e) => setAutoSyncRate(e.target.checked)}
                  className="h-4 w-4 rounded border-input bg-background accent-primary"
                />
                <label htmlFor="autoSyncRate" className="font-semibold text-foreground cursor-pointer">
                  Sincronizar automáticamente con Tasa Oficial BCV
                </label>
              </div>
              <p className="text-[10px] text-muted-foreground pl-6">
                Si está activo, las operaciones calcularán el contravalor con el valor oficial del Banco Central de Venezuela.
              </p>
            </div>
          </div>

          {/* Tarjeta de Tasa Actual */}
          <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] text-muted-foreground uppercase font-semibold">Tasa Efectiva en Operaciones</span>
                <div className="font-mono font-bold text-lg text-foreground">
                  {formatVES(effectiveRate)}
                </div>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-muted-foreground uppercase font-semibold">Fuente Activa</span>
                <div className="mt-1">
                  <Badge variant={rateSource === 'auto_bcv' ? 'emerald' : 'amber'} size="sm" dot>
                    {rateSource === 'auto_bcv'
                      ? `BCV Oficial (${bcvRate ? formatVES(bcvRate) : 'En Vivo'})`
                      : 'Tasa Manual de la Empresa'}
                  </Badge>
                </div>
              </div>
            </div>

            {!autoSyncRate && (
              <div className="pt-3 border-t border-border">
                <label className="block font-semibold text-foreground mb-1" htmlFor="manual-rate">
                  Tasa de Cambio Manual de la Empresa (Bs. por 1 USD)
                </label>
                <Input
                  id="manual-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={manualExchangeRate}
                  onChange={(e) => setManualExchangeRate(Number(e.target.value))}
                  placeholder="Ej. 65.40"
                  className="font-mono sm:w-64"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Aplica para facturación y cobros cuando la sincronización automática del BCV está inactiva.
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Botón Guardar */}
        <Separator />
        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" asChild>
            <a href={`/${tenant.slug}/erp`}>Volver al Dashboard</a>
          </Button>
          <Button type="submit" disabled={loading} size="lg">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Guardando Cambios...</span>
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                <span>Guardar Configuración</span>
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
