'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BadgeCheck, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { approveApprovalAction, rejectApprovalAction } from '@/actions/erpActions';
import { formatUSD } from './format';
import { Badge } from './Badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState } from './EmptyState';

export interface ApprovalEntry {
  id: number;
  status: 'pending' | 'approved' | 'consumed' | 'rejected' | 'expired';
  requestedByName: string;
  resolvedByName: string | null;
  decisionNote: string | null;
  customerId: number | null;
  totalUSD: number;
  itemCount: number;
  expiresAt: string | null;
  createdAt: string;
}

const STATUS_BADGE: Record<ApprovalEntry['status'], { variant: 'emerald' | 'amber' | 'slate' | 'rose' | 'indigo'; label: string }> = {
  pending: { variant: 'amber', label: 'Pendiente' },
  approved: { variant: 'indigo', label: 'Aprobada' },
  consumed: { variant: 'emerald', label: 'Consumida' },
  rejected: { variant: 'rose', label: 'Rechazada' },
  expired: { variant: 'slate', label: 'Expirada' },
};

/**
 * Bandeja de aprobaciones (IE-PR6): pendientes primero con acción de
 * aprobar/rechazar + nota de decisión; el histórico reciente queda como
 * pista de auditoría de quién firmó qué.
 */
export function ApprovalsView({ tenantId, tenantSlug, entries }: { tenantId: number; tenantSlug: string; entries: ApprovalEntry[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  const resolve = async (id: number, action: 'approve' | 'reject') => {
    setBusyId(id);
    setError(null);
    const decisionNote = (notes[id] ?? '').trim();
    const res =
      action === 'approve'
        ? await approveApprovalAction({ tenantId, tenantSlug, approvalId: id, decisionNote })
        : await rejectApprovalAction({ tenantId, tenantSlug, approvalId: id, decisionNote });
    setBusyId(null);
    if (!res.success) {
      setError(res.error || 'No se pudo resolver la solicitud.');
      return;
    }
    setNotes((prev) => ({ ...prev, [id]: '' }));
    router.refresh();
  };

  if (entries.length === 0) {
    return (
      <Card className="p-5">
        <EmptyState
          icon={BadgeCheck}
          title="No hay solicitudes de aprobación"
          description="Cuando una venta a crédito exceda el límite del cliente, aparecerá aquí para su autorización."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-600 dark:text-rose-400" role="alert">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {entries.map((entry) => {
          const badge = STATUS_BADGE[entry.status] ?? STATUS_BADGE.pending;
          const actionable = entry.status === 'pending' || entry.status === 'approved';
          return (
            <Card key={entry.id} className="p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={badge.variant} size="sm" dot>
                    {badge.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Solicitud <span className="font-mono text-foreground">#{entry.id}</span> ·{' '}
                    {entry.itemCount} línea(s) ·{' '}
                    <span className="font-mono font-bold text-foreground">{formatUSD(entry.totalUSD)}</span>
                    {entry.customerId ? ` · cliente #${entry.customerId}` : ''}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  Solicitada por <strong>{entry.requestedByName}</strong> ·{' '}
                  {new Date(entry.createdAt).toLocaleString('es-VE')}
                  {entry.expiresAt &&
                    ` · vence ${new Date(entry.expiresAt).toLocaleString('es-VE')}`}
                </span>
              </div>

              {entry.decisionNote && (
                <p className="text-xs text-muted-foreground">
                  Nota{entry.resolvedByName ? ` de ${entry.resolvedByName}` : ''}: {entry.decisionNote}
                </p>
              )}

              {actionable && (
                <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                  <Input
                    type="text"
                    value={notes[entry.id] ?? ''}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [entry.id]: e.target.value }))}
                    placeholder="Nota de decisión (obligatoria al rechazar)"
                    className="h-9 text-xs flex-1"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="h-9"
                      disabled={busyId === entry.id}
                      onClick={() => resolve(entry.id, 'approve')}
                    >
                      {busyId === entry.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      Aprobar y facturar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9"
                      disabled={busyId === entry.id}
                      onClick={() => resolve(entry.id, 'reject')}
                    >
                      <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      Rechazar
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
