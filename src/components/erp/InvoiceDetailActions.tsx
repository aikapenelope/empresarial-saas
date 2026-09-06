'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Printer, Ban, Loader2 } from 'lucide-react';

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
    >
      <Printer className="h-3.5 w-3.5" />
      <span>Imprimir</span>
    </button>
  );
}

export function VoidInvoiceButton({
  tenantId,
  tenantSlug,
  invoiceId,
  invoiceNumber,
}: {
  tenantId: number;
  tenantSlug: string;
  invoiceId: number;
  invoiceNumber: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleVoid = () => {
    const reason = window.prompt(
      `Anular la factura ${invoiceNumber} revierte su inventario (movimientos sale_return) y deja el balance en cero. Indica el motivo:`,
    );
    if (reason === null) return; // cancelado

    startTransition(async () => {
      // Import dinámico para no cargar la acción en el bundle inicial del listado
      const { voidInvoiceAction } = await import('@/actions/erpActions');
      const res = await voidInvoiceAction({
        tenantId,
        tenantSlug,
        invoiceId,
        reason: reason || undefined,
      });

      if (res.success) {
        setError(null);
        router.refresh();
      } else {
        setError(res.error || 'Error al anular la factura.');
      }
    });
  };

  return (
    <div className="no-print">
      <button
        type="button"
        onClick={handleVoid}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/30 bg-rose-600/10 text-xs font-semibold text-rose-300 hover:bg-rose-600 hover:text-white transition-colors disabled:opacity-50"
      >
        {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        <Ban className="h-3.5 w-3.5" />
        <span>Anular Factura</span>
      </button>
      {error && <p className="mt-1.5 text-[11px] text-rose-400">{error}</p>}
    </div>
  );
}
