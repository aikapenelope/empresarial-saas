'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  BellRing,
  CheckCheck,
  CircleCheck,
  Package,
  Receipt,
  TrendingUp,
  Users,
  ClipboardList,
  UserCheck,
  Globe,
} from 'lucide-react';
import { EmptyState } from './EmptyState';
import { toast } from 'sonner';
import { acknowledgeAlertAction, resolveAlertAction } from '@/actions/erpActions';
import { ErpPageHeader } from './ErpPageHeader';
import { Button } from '@/components/ui/button';
import { cn } from '@/utilities/cn';
import type { Alert } from '@/payload-types';

interface AlertsViewProps {
  tenantId: number;
  tenantSlug: string;
  active: Alert[];
  resolved: Alert[];
  counts: { active: number; unacknowledged: number };
}

const TYPE_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; refRoute?: (tenantSlug: string, refId: number) => string }
> = {
  low_stock: {
    label: 'Stock Bajo',
    icon: Package,
    refRoute: (t, id) => `/${t}/erp/inventory?product=${id}`,
  },
  inventory_diff: {
    label: 'Conteo con Diferencias',
    icon: ClipboardList,
    refRoute: (t, _id) => `/${t}/erp/inventory/counts`,
  },
  rate_change: { label: 'Variación de Tasa', icon: TrendingUp, refRoute: (t) => `/${t}/erp/rates` },
  overdue_invoice: {
    label: 'Factura Vencida',
    icon: Receipt,
    refRoute: (t, id) => `/${t}/erp/invoices/${id}`,
  },
  vendor_overdue: { label: 'Canal con Vencidos', icon: Users, refRoute: (t) => `/${t}/erp/vendors` },
  storefront_order: {
    label: 'Pedido Web B2B',
    icon: Globe,
    refRoute: (t) => `/${t}/erp/quotes?origin=storefront`,
  },
};

function alertIcon(type: string) {
  const meta = TYPE_META[type];
  const Icon = meta?.icon || BellRing;
  return <Icon className="h-4 w-4 text-muted-foreground" />;
}

const SEVERITY_STYLES: Record<string, { badge: string; ring: string; label: string }> = {
  critical: {
    badge: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
    ring: 'border-rose-500/30 bg-rose-500/5',
    label: 'Crítica',
  },
  warning: {
    badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    ring: 'border-border bg-card',
    label: 'Advertencia',
  },
  info: {
    badge: 'bg-muted text-muted-foreground',
    ring: 'border-border bg-card',
    label: 'Info',
  },
};

export function AlertsView({ tenantId, tenantSlug, active, resolved, counts }: AlertsViewProps) {
  const [busyAlertId, setBusyAlertId] = useState<number | undefined>(undefined);

  const handleAck = async (alertId: number) => {
    setBusyAlertId(alertId);
    const res = await acknowledgeAlertAction({ tenantId, tenantSlug, alertId });
    setBusyAlertId(undefined);
    if (res.success) toast.success('Alerta reconocida.');
    else toast.error(res.error || 'No se pudo reconocer la alerta.');
  };

  const handleResolve = async (alertId: number) => {
    setBusyAlertId(alertId);
    const res = await resolveAlertAction({ tenantId, tenantSlug, alertId });
    setBusyAlertId(undefined);
    if (res.success) toast.success('Alerta resuelta.');
    else toast.error(res.error || 'No se pudo resolver la alerta.');
  };

  return (
    <div className="space-y-6">
      <ErpPageHeader
        title="Centro de Alertas"
        description="Evaluación automática cada 15 minutos: stock bajo, conteos pendientes, facturas vencidas, variación de tasa y canal con vencidos."
        breadcrumbHref={`/${tenantSlug}/erp`}
        section="Alertas"
        actions={
          <>
            <span className="inline-flex items-center rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
              {counts.active} activa(s)
            </span>
            <span className="inline-flex items-center rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
              {counts.unacknowledged} sin reconocer
            </span>
          </>
        }
      />

      {/* Activas — feed por severidad */}
      <div className="space-y-2">
        {active.length === 0 ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5">
            <EmptyState icon={CircleCheck} title="Todo en orden" description="No hay alertas activas para este inquilino." />
          </div>
        ) : (
          active.map((a) => {
            const meta = TYPE_META[a.type];
            const severity = SEVERITY_STYLES[a.severity] || SEVERITY_STYLES.info;
            const refHref = meta?.refRoute ? meta.refRoute(tenantSlug, Number(a.refId) || 0) : null;
            return (
              <div
                key={a.id}
                className={cn(
                  'rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3 transition-colors',
                  severity.ring,
                )}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {alertIcon(a.type)}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">
                        {meta?.label || a.type}
                      </span>
                      <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold', severity.badge)}>
                        {severity.label}
                      </span>
                      {a.acknowledgedAt && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          <UserCheck className="h-3 w-3" aria-hidden="true" /> reconocida
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-foreground mt-0.5 truncate">{a.message}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {refHref && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" asChild>
                      <Link href={refHref}>Ver</Link>
                    </Button>
                  )}
                  {!a.acknowledgedAt && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => handleAck(a.id)}
                      disabled={busyAlertId === a.id}
                    >
                      <CheckCheck className="h-3 w-3" aria-hidden="true" />
                      <span>Reconocer</span>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px] text-emerald-600 dark:text-emerald-400"
                    onClick={() => handleResolve(a.id)}
                    disabled={busyAlertId === a.id}
                  >
                    <CircleCheck className="h-3 w-3" aria-hidden="true" />
                    <span>Resolver</span>
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Histórico resuelto */}
      {resolved.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <BellRing className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">Resueltas Recientemente</h2>
            <span className="text-xs text-muted-foreground ml-auto">{resolved.length}</span>
          </div>
          <div className="divide-y divide-border">
            {resolved.map((a) => (
              <div key={a.id} className="p-3 flex items-center gap-3 text-xs">
                {alertIcon(a.type)}
                <span className="text-muted-foreground flex-1 truncate line-through">{a.message}</span>
                <span className="text-[10px] text-muted-foreground">
                  {a.resolvedAt ? new Date(a.resolvedAt).toLocaleString('es-VE') : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
