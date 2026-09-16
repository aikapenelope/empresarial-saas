import React from 'react';
import Link from 'next/link';
import {
	getTenantBySlug,
	getAllTenants,
	getActiveAlertCount,
	getPendingApprovalsCount,
} from '@/utilities/erpData';
import { getLiveExchangeRates, resolveEffectiveRate } from '@/utilities/exchangeRate';
import { requireErpTenantAccess, ErpAccessError } from '@/utilities/erpAuth';
import { AppShell } from '@/components/app-shell';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}

export default async function ErpLayout({ children, params }: LayoutProps) {
  const { tenant: tenantSlug } = await params;

  // Blindaje anti-enumeración: tanto el lookup del inquilino como el listado de
  // empresas exigen sesión válida (getTenantBySlug/getAllTenants lo imponen).
  let tenant: Awaited<ReturnType<typeof getTenantBySlug>> = null;
  let availableTenants: Awaited<ReturnType<typeof getAllTenants>> = [];
  try {
    tenant = await getTenantBySlug(tenantSlug);
    if (!tenant) {
      availableTenants = await getAllTenants();
    }
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  if (!tenant) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-background text-foreground">
        <div className="max-w-md w-full rounded-2xl border border-border bg-card p-8 text-center space-y-4 shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 font-bold text-lg">
            !
          </div>
          <h2 className="text-xl font-bold tracking-tight">Empresa no encontrada</h2>
          <p className="text-sm text-muted-foreground">
            No existe ningún inquilino registrado con el identificador{' '}
            <code className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-xs border border-border">
              {tenantSlug}
            </code>
            .
          </p>

          {availableTenants.length > 0 && (
            <div className="pt-2 text-left space-y-2 border-t border-border">
              <p className="text-xs uppercase font-semibold text-muted-foreground">Empresas disponibles:</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {availableTenants.map((t) => (
                  <Link
                    key={t.id}
                    href={`/${t.slug}/erp`}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/60 hover:bg-muted text-xs text-foreground transition-colors"
                  >
                    <span className="font-medium">{t.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">/{t.slug}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2">
            <Link
              href="/"
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-xs font-semibold text-primary-foreground transition-colors w-full"
            >
              Volver al Selector de Empresas
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Puerta de autorización del ERP: sesión válida + pertenencia al inquilino
  // (el control se re-aplica en cada consulta de la capa de datos).
  let actor: Awaited<ReturnType<typeof requireErpTenantAccess>> | null = null;
  try {
    actor = await requireErpTenantAccess(tenant.id);
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  const [fetchedTenants, liveRates, effectiveRateData, activeAlertCount, approvalsPendingCount] =
    await Promise.all([
      getAllTenants(),
      getLiveExchangeRates(),
      resolveEffectiveRate(
        tenant.currencyConfig
          ? {
              manualExchangeRate: tenant.currencyConfig.manualExchangeRate ?? undefined,
              autoSyncRate: tenant.currencyConfig.autoSyncRate ?? undefined,
            }
          : undefined,
      ),
      getActiveAlertCount(tenant.id),
      getPendingApprovalsCount(tenant.id),
    ]);
  availableTenants = fetchedTenants;

  const rates = {
    bcv: liveRates.bcv,
    binance: liveRates.binance,
    paralelo: liveRates.paralelo,
    effectiveRate: effectiveRateData.rate,
    source: effectiveRateData.source,
    lastUpdated: liveRates.lastUpdated,
  };

  return (
    <AppShell
      tenantName={tenant.name}
      tenantSlug={tenant.slug}
      tenantId={tenant.id}
      rates={rates}
      userRole={actor?.role}
      userName={actor?.name ?? 'Usuario'}
      userEmail={actor?.email ?? ''}
      activeAlertCount={activeAlertCount}
      approvalsPendingCount={approvalsPendingCount}
    >
      {children}
    </AppShell>
  );
}
