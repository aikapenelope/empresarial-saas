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
      <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-950 text-white">
        <div className="max-w-md w-full rounded-2xl border border-slate-800 bg-slate-900/80 p-8 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            !
          </div>
          <h2 className="text-xl font-bold">Empresa no encontrada</h2>
          <p className="text-sm text-slate-400">
            No existe ningún inquilino registrado con el identificador{' '}
            <code className="px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300 font-mono text-xs">
              {tenantSlug}
            </code>
            .
          </p>

          {availableTenants.length > 0 && (
            <div className="pt-2 text-left space-y-2 border-t border-slate-800">
              <p className="text-xs uppercase font-semibold text-slate-400">Empresas disponibles:</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {availableTenants.map((t) => (
                  <Link
                    key={t.id}
                    href={`/${t.slug}/erp`}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-xs text-slate-200"
                  >
                    <span>{t.name}</span>
                    <span className="text-[10px] text-indigo-400 font-mono">/{t.slug}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2">
            <Link
              href="/"
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-all w-full"
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
