import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ClipboardList, Truck } from 'lucide-react';
import { getTenantBySlug, getOrderDetail } from '@/utilities/erpData';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { ErpPageHeader } from '@/components/erp/ErpPageHeader';
import { PrintButton } from '@/components/erp/PrintButton';
import { IssueDeliveryNoteButton } from '@/components/erp/IssueDeliveryNoteButton';
import { Badge } from '@/components/erp/Badge';
import { formatUSD, formatVES } from '@/components/erp/format';
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

const STATUS_BADGE: Record<string, { variant: 'slate' | 'amber' | 'emerald' | 'rose' | 'indigo'; label: string }> = {
  draft: { variant: 'slate', label: 'Borrador' },
  confirmed: { variant: 'amber', label: 'Confirmado' },
  invoiced: { variant: 'indigo', label: 'Facturado' },
  canceled: { variant: 'rose', label: 'Cancelado' },
};

export default async function OrderDetailPage({ params }: PageProps) {
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

  let data: Awaited<ReturnType<typeof getOrderDetail>>;
  try {
    data = await getOrderDetail(tenant.id, Number(id));
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  const { order } = data;
  const badge = STATUS_BADGE[order.status] || STATUS_BADGE.draft;
  const customer =
    typeof order.customer === 'object' && order.customer !== null ? order.customer : null;
  const invoiceId =
    typeof order.issuedInvoice === 'object' && order.issuedInvoice !== null
      ? order.issuedInvoice.id
      : order.issuedInvoice;
  const rate = Number(order.exchangeRateSnapshot) || 1;

  return (
    <div className="space-y-6">
      {/* Header (no imprime) */}
      <div className="no-print">
        <ErpPageHeader
          title={order.orderNumber || `Pedido #${order.id}`}
          breadcrumbHref={`/${tenantSlug}/erp/orders`}
          breadcrumbLabel="Pedidos"
          actions={
            <>
              {order.status === 'confirmed' && (
                <IssueDeliveryNoteButton
                  tenantId={tenant.id}
                  tenantSlug={tenantSlug}
                  order={{ id: order.id, orderNumber: order.orderNumber }}
                  lines={(Array.isArray(order.items) ? order.items : []).map((it, index) => ({
                    index,
                    description: it.description,
                    sku: it.sku,
                    ordered: Number(it.quantity) || 0,
                    dispatched: data.dispatchedByIndex[index] || 0,
                  }))}
                />
              )}
              {invoiceId && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/${tenantSlug}/erp/invoices/${invoiceId}`}>Ver Factura Emitida</Link>
                </Button>
              )}
              <PrintButton label="Imprimir Pedido" />
            </>
          }
        />
      </div>

      {/* Contenido imprimible */}
      <div className="print-area space-y-6">
        {/* Ficha del pedido */}
        <Card className="rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <ClipboardList className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                {order.orderNumber}
              </h1>
              <p className="text-xs text-muted-foreground">
                {customer ? `${customer.name} · ${customer.taxId}` : 'Cliente'}
              </p>
            </div>
            <div className="text-right space-y-1">
              <Badge variant={badge.variant} size="sm" dot={order.status === 'confirmed'}>
                {badge.label}
              </Badge>
              <p className="text-[11px] text-muted-foreground">
                {order.issueDate ? new Date(order.issueDate).toLocaleDateString('es-VE') : '—'}
                {order.confirmedAt
                  ? ` · Confirmado ${new Date(order.confirmedAt).toLocaleDateString('es-VE')}`
                  : ''}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Tier: <span className="uppercase">{order.priceTierSnapshot || 'retail'}</span>
              </p>
            </div>
          </div>
        </Card>

        {/* Líneas */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Descripción</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Cant.</TableHead>
                  <TableHead className="text-right">Despachada</TableHead>
                  <TableHead className="text-right">Precio (USD)</TableHead>
                  <TableHead className="text-right">Desc. %</TableHead>
                  <TableHead className="text-right">Total (USD)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(Array.isArray(order.items) ? order.items : []).map((it, idx) => {
                  const ordered = Number(it.quantity) || 0;
                  const dispatched = data.dispatchedByIndex[idx] || 0;
                  return (
                    <TableRow key={idx}>
                      <TableCell>{it.description}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{it.sku || '—'}</TableCell>
                      <TableCell className="text-right font-mono">{ordered}</TableCell>
                      <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400">
                        {dispatched > 0 ? `${dispatched}${dispatched >= ordered ? ' ✓' : ''}` : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatUSD(Number(it.unitPriceUSD) || 0)}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {Number(it.discountPct) > 0 ? `${it.discountPct}%` : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold">
                        {formatUSD(Number(it.totalUSD) || 0)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Totales */}
        <Card className="rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Tasa aplicada:</span>
            <span className="font-mono">{formatUSD(rate)} / USD</span>
          </div>
          <div className="flex items-center justify-between text-base font-bold text-foreground border-t border-border pt-2">
            <span>Total Pedido (USD):</span>
            <span className="font-mono text-amber-600 dark:text-amber-400">{formatUSD(Number(order.totalUSD) || 0)}</span>
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Total Pedido (VES):</span>
            <span className="font-mono">{formatVES(Number(order.totalVES) || 0)}</span>
          </div>
        </Card>

        {/* Remisiones emitidas */}
        {data.deliveryNotes.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <Truck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-foreground">Remisiones Emitidas</h2>
              <span className="text-xs text-muted-foreground ml-auto">{data.deliveryNotes.length} remisión(es)</span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Nro.</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Líneas</TableHead>
                    <TableHead className="text-right">Valor (USD)</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.deliveryNotes.map((n) => (
                    <TableRow key={n.id}>
                      <TableCell className="font-mono font-bold">
                        <Link
                          href={`/${tenantSlug}/erp/delivery-notes/${n.id}`}
                          className="underline decoration-border underline-offset-2 hover:decoration-foreground"
                        >
                          {n.noteNumber}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-[11px]">
                        {n.issueDate ? new Date(n.issueDate).toLocaleDateString('es-VE') : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {Array.isArray(n.items) ? n.items.length : 0}
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatUSD(Number(n.totalUSD) || 0)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={n.status === 'voided' ? 'rose' : 'emerald'} size="sm" dot={n.status !== 'voided'}>
                          {n.status === 'voided' ? 'Anulada' : 'Emitida'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Notas */}
        {order.notes && (
          <Card className="rounded-xl p-5">
            <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Notas / Instrucciones</p>
            <p className="text-xs text-foreground whitespace-pre-wrap">{order.notes}</p>
          </Card>
        )}
      </div>
    </div>
  );
}
