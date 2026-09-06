'use client';

import React, { useState } from 'react';
import { Truck } from 'lucide-react';
import { IssueDeliveryNoteModal, type DeliverableLine } from './modals/IssueDeliveryNoteModal';
import { useRouter } from 'next/navigation';

interface IssueDeliveryNoteButtonProps {
  tenantId: number;
  tenantSlug: string;
  order: { id: number; orderNumber: string };
  lines: DeliverableLine[];
}

/**
 * Botón "Emitir Remisión" para pedidos confirmados (Sprint 20). Cliente puro:
 * la página de detalle (RSC) le pasa las líneas con su crosstab de despacho y
 * refresca el server component al cerrar el modal con éxito.
 */
export function IssueDeliveryNoteButton({
  tenantId,
  tenantSlug,
  order,
  lines,
}: IssueDeliveryNoteButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const pendingLines = lines.filter((l) => l.ordered - l.dispatched > 0);
  if (pendingLines.length === 0) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="no-print inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-500/30 bg-indigo-600/10 text-xs font-semibold text-indigo-300 hover:bg-indigo-600 hover:text-white transition-colors"
      >
        <Truck className="h-3.5 w-3.5" />
        <span>Emitir Remisión</span>
      </button>

      {open && (
        <IssueDeliveryNoteModal
          isOpen
          onClose={() => {
            setOpen(false);
            router.refresh();
          }}
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          order={order}
          lines={lines}
        />
      )}
    </>
  );
}
