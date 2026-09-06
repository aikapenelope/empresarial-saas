'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BellRing,
  CheckCheck,
  CircleCheck,
  Package,
  Receipt,
  TrendingUp,
  Truck,
  Users,
  ClipboardList,
  UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { acknowledgeAlertAction, resolveAlertAction } from '@/actions/erpActions';
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
    refRoute: (t, id) => `/${t}/erp/inventory/counts`,
  },
  rate_change: { label: 'Variación de Tasa', icon: TrendingUp, refRoute: (t) => `/${t}/erp/rates` },
  overdue_invoice: {
    label: 'Factura Vencida',
    icon: Receipt,
    refRoute: (t, id) => `/${t}/erp/invoices/${id}`,
  },
  vendor_overdue: { label: 'Canal con Vencidos', icon: Users, refRoute: (t) => `/${t}/erp/vendors` },
};

const SEVERITY_BADGE: Record<string, { variant: 'rose' | 'amber' | 'slate'; label: string }> = {
  critical: { variant: 'rose', label: 'Crítica' },
  warning: { variant: 'amber', label: 'Advertencia' },
  info: { variant: 'slate', label: 'Info' },
};

function alertIcon(type: string) {
  const meta = TYPE_META[type];
  const Icon = meta?.icon || BellRing;
  return <Icon className="h-4 w-4 text-indigo-400" />;
}

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
            <span className="text-xs font-semibold text-indigo-400">Alertas</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <BellRing className="h-6 w-6 text-amber-400" />
            Centro de Alertas
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Evaluación automática cada 15 minutos: stock bajo, conteos pendientes, facturas vencidas, variación de tasa y canal con vencidos.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 font-semibold text-amber-300">
            {counts.active} activa(s)
          </span>
          <span className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 font-semibold text-slate-300">
            {counts.unacknowledged} sin reconocer
          </span>
        </div>
      </div>

      {/* Activas */}
      <div className="space-y-2">
        {active.length === 0 ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-8 text-center">
            <CircleCheck className="h-8 w-8 text-emerald-400 mx-auto" />
            <p className="text-sm font-semibold text-emerald-300 mt-2">Todo en orden</p>
            <p className="text-xs text-slate-400">No hay alertas activas para este inquilino.</p>
          </div>
        ) : (
          active.map((a) => {
            const meta = TYPE_META[a.type];
            const severity = SEVERITY_BADGE[a.severity] || SEVERITY_BADGE.info;
            const refHref = meta?.refRoute ? meta.refRoute(tenantSlug, Number(a.refId) || 0) : null;
            return (
              <div
                key={a.id}
                className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3 transition-colors ${
                  a.severity === 'critical'
                    ? 'border-rose-500/30 bg-rose-500/5'
                    : 'border-slate-800/80 bg-slate-900/60'
                }`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {alertIcon(a.type)}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] uppercase font-bold text-slate-400">
                        {meta?.label || a.type}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          a.severity === 'critical'
                            ? 'bg-rose-500/20 text-rose-300'
                            : a.severity === 'warning'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        {severity.label}
                      </span>
                      {a.acknowledgedAt && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                          <UserCheck className="h-3 w-3" /> reconocida
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-200 mt-0.5 truncate">{a.message}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {refHref && (
                    <Link
                      href={refHref}
                      className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 px-2 py-1"
                    >
                      Ver
                    </Link>
                  )}
                  {!a.acknowledgedAt && (
                    <button
                      onClick={() => handleAck(a.id)}
                      disabled={busyAlertId === a.id}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 font-semibold disabled:opacity-40"
                    >
                      <CheckCheck className="h-3 w-3" />
                      <span>Reconocer</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleResolve(a.id)}
                    disabled={busyAlertId === a.id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white font-semibold disabled:opacity-40"
                  >
                    <CircleCheck className="h-3 w-3" />
                    <span>Resolver</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Histórico resuelto */}
      {resolved.length > 0 && (
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden">
          <div className="p-4 border-b border-slate-800/80 flex items-center gap-2">
            <Truck className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-white">Resueltas Recientemente</h2>
            <span className="text-xs text-slate-400 ml-auto">{resolved.length}</span>
          </div>
          <div className="divide-y divide-slate-800/60">
            {resolved.map((a) => (
              <div key={a.id} className="p-3 flex items-center gap-3 text-xs">
                {alertIcon(a.type)}
                <span className="text-slate-400 flex-1 truncate line-through">{a.message}</span>
                <span className="text-[10px] text-slate-500">
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
