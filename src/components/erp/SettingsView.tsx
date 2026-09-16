'use client';

import React, { useState } from 'react';
import { updateTenantSettingsAction } from '@/actions/erpActions';
import { formatVES } from './format';
import { Building2, Coins, CheckCircle2, FileText, Loader2, RefreshCw, Globe, ExternalLink } from 'lucide-react';
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
    emailConfig?: {
      autoSendQuoteEmail?: boolean | null;
      autoSendInvoiceEmail?: boolean | null;
      alertsEmailEnabled?: boolean | null;
      alertsEmailRecipients?: Array<{ email: string }> | null;
    } | null;
    storefrontConfig?: {
      enabled?: boolean | null;
      whatsappOrdersNumber?: string | null;
      portalTitle?: string | null;
      portalDescription?: string | null;
      tagline?: string | null;
      announcementText?: string | null;
      deliveryPolicy?: string | null;
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
  const [autoSendQuoteEmail, setAutoSendQuoteEmail] = useState<boolean>(
    tenant.emailConfig?.autoSendQuoteEmail ?? true,
  );
  const [autoSendInvoiceEmail, setAutoSendInvoiceEmail] = useState<boolean>(
    tenant.emailConfig?.autoSendInvoiceEmail ?? false,
  );
  // Alertas por email (IE-PR4): textarea con un email por línea — simple para
  // el operador; el parseo/validación vive en el schema de la action.
  const [alertsEmailEnabled, setAlertsEmailEnabled] = useState<boolean>(
    tenant.emailConfig?.alertsEmailEnabled ?? false,
  );
  const [alertsRecipientsText, setAlertsRecipientsText] = useState<string>(
    (tenant.emailConfig?.alertsEmailRecipients ?? [])
      .map((r) => r.email)
      .join('\n'),
  );
  const [manualExchangeRate, setManualExchangeRate] = useState<number>(
    tenant.currencyConfig?.manualExchangeRate || 0,
  );

  // Portal de Pedidos B2B (Catálogo Web - Sprint 54)
  const [storefrontWhatsappNumber, setStorefrontWhatsappNumber] = useState<string>(
    tenant.storefrontConfig?.whatsappOrdersNumber || '',
  );
  const [storefrontPortalTitle, setStorefrontPortalTitle] = useState<string>(
    tenant.storefrontConfig?.portalTitle || 'Portal de Pedidos y Catálogo Mayorista',
  );
  const [storefrontPortalDescription, setStorefrontPortalDescription] = useState<string>(
    tenant.storefrontConfig?.portalDescription || '',
  );
  const [storefrontTagline, setStorefrontTagline] = useState<string>(
    tenant.storefrontConfig?.tagline || '',
  );
  const [storefrontAnnouncementText, setStorefrontAnnouncementText] = useState<string>(
    tenant.storefrontConfig?.announcementText || '',
  );
  const [storefrontDeliveryPolicy, setStorefrontDeliveryPolicy] = useState<string>(
    tenant.storefrontConfig?.deliveryPolicy || '',
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const alertsEmailRecipients = alertsRecipientsText
      .split(/[\n,;]+/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

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
      autoSendQuoteEmail,
      autoSendInvoiceEmail,
      alertsEmailEnabled,
      alertsEmailRecipients,
      storefrontWhatsappNumber,
      storefrontPortalTitle,
      storefrontPortalDescription,
      storefrontTagline,
      storefrontAnnouncementText,
      storefrontDeliveryPolicy,
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
            <div>
              <label htmlFor="auto-send-quote" className="block font-semibold text-foreground mb-1">
                Auto-envío de presupuestos
              </label>
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
                <input
                  id="auto-send-quote"
                  type="checkbox"
                  checked={autoSendQuoteEmail}
                  onChange={(e) => setAutoSendQuoteEmail(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[var(--color-primary,currentColor)]"
                />
                Enviar el presupuesto por email al crearlo (Resend — requiere RESEND_API_KEY y email del cliente).
              </label>
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer mt-2">
                <input
                  type="checkbox"
                  checked={autoSendInvoiceEmail}
                  onChange={(e) => setAutoSendInvoiceEmail(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[var(--color-primary,currentColor)]"
                />
                Enviar la factura por email al emitirla (desactivado por defecto).
              </label>
            </div>
          </div>

          {/* Alertas por email (IE-PR4): digest anti-spam por ciclo del evaluador */}
          <div className="border-t border-border pt-4 space-y-2">
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
              <input
                id="alerts-email-enabled"
                type="checkbox"
                checked={alertsEmailEnabled}
                onChange={(e) => setAlertsEmailEnabled(e.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--color-primary,currentColor)]"
              />
              <span>
                <strong className="text-foreground">Alertas nuevas por email</strong> — un
                digest por ciclo del evaluador con las alertas warning/critical aún no
                notificadas (requiere RESEND_API_KEY y dominio verificado).
              </span>
            </label>
            {alertsEmailEnabled && (
              <div>
                <label
                  htmlFor="alerts-recipients"
                  className="block font-semibold text-foreground mb-1"
                >
                  Destinatarios (un email por línea — vacío = administradores del inquilino)
                </label>
                <textarea
                  id="alerts-recipients"
                  value={alertsRecipientsText}
                  onChange={(e) => setAlertsRecipientsText(e.target.value)}
                  rows={3}
                  placeholder={'gerencia@empresa.com\ncontador@empresa.com'}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground font-mono text-xs focus:border-ring focus:outline-none"
                />
              </div>
            )}
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

        {/* Sección: Portal de Pedidos B2B (Catálogo Web - Sprint 54) */}
        <Card className="p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border pb-3 gap-2">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-foreground">Portal de Pedidos B2B (Catálogo Web)</h2>
            </div>
            <div className="flex items-center gap-2">
              {tenant.storefrontConfig?.enabled ? (
                <>
                  <Badge variant="emerald" size="sm" dot>
                    Activo
                  </Badge>
                  <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1.5" asChild>
                    <a href={`/${tenant.slug}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      <span>Ver Portal Público</span>
                    </a>
                  </Button>
                </>
              ) : (
                <Badge variant="slate" size="sm">
                  Inactivo (Controlado por Superadmin)
                </Badge>
              )}
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Personaliza el título, eslogan, banner superior y políticas de despacho de tu catálogo público accesible en{' '}
            <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-foreground">/{tenant.slug}</code>.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-foreground mb-1" htmlFor="storefront-title">
                Título del Catálogo Web
              </label>
              <Input
                id="storefront-title"
                type="text"
                value={storefrontPortalTitle}
                onChange={(e) => setStorefrontPortalTitle(e.target.value)}
                placeholder="Portal de Pedidos y Catálogo Mayorista"
              />
            </div>

            <div>
              <label className="block font-semibold text-foreground mb-1" htmlFor="storefront-tagline">
                Eslogan o Subtítulo de Marca
              </label>
              <Input
                id="storefront-tagline"
                type="text"
                value={storefrontTagline}
                onChange={(e) => setStorefrontTagline(e.target.value)}
                placeholder="Ej. Distribuidor Mayorista Autorizado"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-foreground mb-1" htmlFor="storefront-whatsapp">
                WhatsApp Oficial para Recepción de Pedidos
              </label>
              <Input
                id="storefront-whatsapp"
                type="tel"
                value={storefrontWhatsappNumber}
                onChange={(e) => setStorefrontWhatsappNumber(e.target.value)}
                placeholder="Ej. +584121234567"
                className="font-mono"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Número al que se redirige el cliente para enviar el mensaje con la cotización.
              </p>
            </div>

            <div>
              <label className="block font-semibold text-foreground mb-1" htmlFor="storefront-announcement">
                Anuncio o Promoción Superior (Banner)
              </label>
              <Input
                id="storefront-announcement"
                type="text"
                value={storefrontAnnouncementText}
                onChange={(e) => setStorefrontAnnouncementText(e.target.value)}
                placeholder="Ej. Despacho gratis en compras mayores a $300 a nivel nacional"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Barra de aviso destacada en la parte superior del catálogo. Dejar vacío para ocultar.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-foreground mb-1" htmlFor="storefront-description">
                Condiciones Comerciales y Mensaje de Bienvenida
              </label>
              <textarea
                id="storefront-description"
                rows={2}
                value={storefrontPortalDescription}
                onChange={(e) => setStorefrontPortalDescription(e.target.value)}
                placeholder="Precios sujetos a cambio sin previo aviso..."
                className="w-full rounded-md border border-border bg-card p-2 text-xs text-foreground"
              />
            </div>

            <div>
              <label className="block font-semibold text-foreground mb-1" htmlFor="storefront-delivery">
                Políticas de Entrega y Despacho
              </label>
              <textarea
                id="storefront-delivery"
                rows={2}
                value={storefrontDeliveryPolicy}
                onChange={(e) => setStorefrontDeliveryPolicy(e.target.value)}
                placeholder="Despachos en 24-48 horas hábiles..."
                className="w-full rounded-md border border-border bg-card p-2 text-xs text-foreground"
              />
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
