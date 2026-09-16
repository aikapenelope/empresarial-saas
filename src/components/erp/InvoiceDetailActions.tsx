'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Printer, Ban, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PrintButton() {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => window.print()}
      className="no-print"
    >
      <Printer className="h-3.5 w-3.5 mr-1" />
      <span>Imprimir</span>
    </Button>
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
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={handleVoid}
        disabled={isPending}
      >
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Ban className="h-3.5 w-3.5 mr-1" />}
        <span>Anular Factura</span>
      </Button>
      {error && <p className="mt-1.5 text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
