import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Truck } from 'lucide-react';
import { getTenantBySlug, getDeliveryNoteDetail } from '@/utilities/erpData';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { ErpPageHeader } from '@/components/erp/ErpPageHeader';
import { PrintButton } from '@/components/erp/PrintButton';
import { Badge } from '@/components/erp/Badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface PageProps {
  params: Promise<{ tenant: string; id: string }>;
}

export default async function DeliveryNoteDetailPage({ params }: PageProps) {
  const { tenant: tenantSlug, id } = await params;
  let tenant: Awaited<ReturnType<typeof getTenantBySlug>> = null;
  try {
    tenant = await getTenantBySlug(tenantSlug);
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  if (!tenant) {
    notFound();
  }

  let note;
  try {
    note = await getDeliveryNoteDetail(tenant.id, Number(id));
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  if (!note) {
    notFound();
  }

  const badge = note.status === 'voided'
    ? { variant: 'rose' as const, label: 'Anulada' }
    : { variant: 'emerald' as const, label: 'Emitida' };
  const order =
    typeof note.order === 'object' && note.order !== null ? note.order : null;
  const customer =
    typeof note.customer === 'object' && note.customer !== null ? note.customer : null;

  return (
    <div className="space-y-6">
      {/* Header (no imprime) */}
      <div className="no-print">
        <ErpPageHeader
          title={`Remisión ${note.noteNumber || `#${note.id}`}`}
          breadcrumbHref={`/${tenantSlug}/erp/delivery-notes`}
          breadcrumbLabel="Remisiones"
          actions={
            <>
              {order && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/${tenantSlug}/erp/orders/${(order as { id: number }).id}`}>Ver Pedido</Link>
                </Button>
              )}
              <PrintButton label="Imprimir Remisión" />
            </>
          }
        />
      </div>

      {/* Contenido imprimible */}
      <div className="print-area space-y-6">
        {/* Ficha */}
        <Card className="rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <Truck className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                Remisión {note.noteNumber}
              </h1>
              <p className="text-xs text-muted-foreground">
                {customer ? `${customer.name} · ${customer.taxId}` : 'Cliente'}
              </p>
            </div>
            <div className="text-right space-y-1">
              <Badge variant={badge.variant} size="sm" dot={note.status !== 'voided'}>
                {badge.label}
              </Badge>
              <p className="text-[11px] text-muted-foreground">
                {note.issueDate ? new Date(note.issueDate).toLocaleDateString('es-VE') : '—'}
              </p>
              {order && (
                <p className="text-[11px] font-mono text-muted-foreground">
                  Pedido: {(order as { orderNumber: string }).orderNumber}
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* Líneas despachadas */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Descripción</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(Array.isArray(note.items) ? note.items : []).map((it, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{it.description}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">{it.sku || '—'}</TableCell>
                    <TableCell className="text-right font-mono font-bold">{it.quantity}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Notas */}
        {note.notes && (
          <Card className="rounded-xl p-5">
            <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Notas de Entrega</p>
            <p className="text-xs text-foreground whitespace-pre-wrap">{note.notes}</p>
          </Card>
        )}
      </div>
    </div>
  );
}
