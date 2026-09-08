'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Truck,
  Ban,
  Printer,
  Send,
  CircleDollarSign,
  FileX2,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatUSD, formatVES } from './format';
import { Badge } from './Badge';
import { KpiCard } from './KpiCard';
import { ErpPageHeader } from './ErpPageHeader';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { voidDeliveryNoteAction } from '@/actions/erpActions';
import { InvoiceDeliveryNoteModal } from './modals/InvoiceDeliveryNoteModal';
import { ShareDocButtons } from './ShareDocButtons';
import type { DeliveryNote } from '@/payload-types';

interface DeliveryNotesViewProps {
  tenantId: number;
  tenantSlug: string;
  notes: DeliveryNote[];
  cashRegisters?: Array<{ id: number; name: string; currentStatus: string }>;
}

const STATUS_BADGE: Record<string, { variant: 'slate' | 'amber' | 'emerald' | 'rose'; label: string }> = {
  issued: { variant: 'emerald', label: 'Emitida' },
  voided: { variant: 'rose', label: 'Anulada' },
};

export function DeliveryNotesView({
  tenantId,
  tenantSlug,
  notes,
  cashRegisters = [],
}: DeliveryNotesViewProps) {
  const [busyNoteId, setBusyNoteId] = useState<number | undefined>(undefined);
  const [invoicingNote, setInvoicingNote] = useState<DeliveryNote | undefined>(undefined);

  const issued = notes.filter((n) => n.status === 'issued');
  const issuedValue = issued.reduce((acc, n) => acc + (Number(n.totalUSD) || 0), 0);

<<<<<<< HEAD
  // Factura el pedido padre (Sprint 41): entrega documentada con nota, factura
  // opcional a demanda. El action rechaza si el pedido ya fue facturado.
  const handleInvoice = async (note: DeliveryNote) => {
    const orderId = typeof note.order === 'object' && note.order !== null ? note.order.id : note.order;
    if (!orderId) {
      toast.error('La remisión no tiene pedido asociado.');
      return;
    }
    setInvoicingNoteId(note.id);
    // Sin paymentTerms: el action respeta el término del pedido (contado/credit).
    const res = await issueInvoiceFromOrderAction({
      tenantId,
      tenantSlug,
      orderId: Number(orderId),
    });
    setInvoicingNoteId(undefined);
    if (res.success) {
      toast.success('Factura emitida desde la remisión.');
    } else {
      toast.error(res.error || 'No se pudo facturar.');
    }
  };

=======
>>>>>>> feat/sprint43-email-invoices
  const handleVoid = async (noteId: number) => {
    setBusyNoteId(noteId);
    const res = await voidDeliveryNoteAction({ tenantId, tenantSlug, deliveryNoteId: noteId });
    setBusyNoteId(undefined);
    if (res.success) {
      toast.success('Remisión anulada.');
    } else {
      toast.error(res.error || 'No se pudo anular la remisión.');
    }
  };

  const orderRef = (n: DeliveryNote) => {
    const order = typeof n.order === 'object' && n.order !== null ? n.order : null;
    if (!order) return { label: '—', href: null };
    return {
      label: (order as { orderNumber: string }).orderNumber,
      href: `/${tenantSlug}/erp/orders/${(order as { id: number }).id}`,
    };
  };

  const customerName = (n: DeliveryNote) =>
    typeof n.customer === 'object' && n.customer !== null
      ? (n.customer as { name: string }).name
      : 'Cliente';

  const customerEmail = (n: DeliveryNote) =>
    typeof n.customer === 'object' && n.customer !== null
      ? ((n.customer as { email?: string | null }).email ?? '')
      : '';

  return (
    <div className="space-y-6">
      <ErpPageHeader
        title="Remisiones / Notas de Entrega"
        description="Documento logístico de despacho emitido desde pedidos confirmados. Sin efecto en inventario: el stock se descarga al facturar."
        breadcrumbHref={`/${tenantSlug}/erp`}
        section="Remisiones"
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Remisiones Emitidas"
          valueUSD={String(issued.length)}
          icon={Send}
          tone="positive"
          description="Activas"
        />
        <KpiCard
          title="Valor Despachado (USD)"
          valueUSD={issuedValue}
          icon={CircleDollarSign}
        />
        <KpiCard
          title="Anuladas"
          valueUSD={String(notes.filter((n) => n.status === 'voided').length)}
          icon={FileX2}
          tone="destructive"
          description="Histórico"
        />
      </div>

      {/* Listado */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">Remisiones del Inquilino</h2>
          </div>
          <span className="text-xs text-muted-foreground">{notes.length} registro(s)</span>
        </div>

        {notes.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-10">
            No hay remisiones registradas. Emítalas desde un pedido confirmado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Nro.</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Valor (USD)</TableHead>
                  <TableHead className="text-right">Valor (VES)</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notes.map((n) => {
                  const badge = STATUS_BADGE[n.status] || STATUS_BADGE.issued;
                  const order = orderRef(n);
                  return (
                    <TableRow key={n.id}>
                      <TableCell className="font-mono font-bold">
                        <Link
                          href={`/${tenantSlug}/erp/delivery-notes/${n.id}`}
                          className="underline decoration-border underline-offset-2 hover:decoration-foreground"
                        >
                          {n.noteNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {order.href ? (
                          <Link href={order.href} className="font-mono underline decoration-border underline-offset-2 hover:decoration-foreground">
                            {order.label}
                          </Link>
                        ) : (
                          order.label
                        )}
                      </TableCell>
                      <TableCell>{customerName(n)}</TableCell>
                      <TableCell className="text-right font-mono font-bold">
                        {formatUSD(Number(n.totalUSD) || 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {formatVES(Number(n.totalVES) || 0)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={badge.variant} size="sm" dot={n.status === 'issued'}>
                          {badge.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {n.status === 'issued' && (
                            <ShareDocButtons
                              collection="delivery-notes"
                              tenantId={tenantId}
                              documentId={n.id}
                              docLabel={n.noteNumber || `REM-${n.id}`}
                              defaultEmail={customerEmail(n)}
                            />
                          )}
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" asChild>
                            <Link href={`/${tenantSlug}/erp/delivery-notes/${n.id}`}>
                              <Printer className="h-3 w-3" aria-hidden="true" />
                              <span>Imprimir</span>
                            </Link>
                          </Button>
                          {n.status === 'issued' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[11px]"
                                onClick={() => setInvoicingNote(n)}
                                disabled={Boolean(invoicingNote)}
                              >
                                <FileText className="h-3 w-3" aria-hidden="true" />
                                <span>Facturar</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[11px] text-rose-600 dark:text-rose-400"
                                onClick={() => handleVoid(n.id)}
                                disabled={busyNoteId === n.id}
                              >
                                <Ban className="h-3 w-3" aria-hidden="true" />
                                <span>Anular</span>
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {invoicingNote && (
        <InvoiceDeliveryNoteModal
          isOpen
          onClose={() => setInvoicingNote(undefined)}
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          note={{
            id: invoicingNote.id,
            noteNumber: invoicingNote.noteNumber,
            orderId:
              typeof invoicingNote.order === 'object' && invoicingNote.order !== null
                ? invoicingNote.order.id
                : Number(invoicingNote.order),
          }}
          cashRegisters={cashRegisters}
          onInvoiced={() => window.location.reload()}
        />
      )}
    </div>
  );
}