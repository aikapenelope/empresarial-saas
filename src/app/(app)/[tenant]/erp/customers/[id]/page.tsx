import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  MessageCircle,
  Receipt,
  Wallet,
} from 'lucide-react';
import {
  getTenantBySlug,
  getCustomerDetail,
} from '@/utilities/erpData';
import { resolveEffectiveRate } from '@/utilities/exchangeRate';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { PrintButton } from '@/components/erp/PrintButton';
import { formatUSD, formatVES } from '@/components/erp/format';
import { Badge } from '@/components/erp/Badge';
import { ErpPageHeader } from '@/components/erp/ErpPageHeader';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Invoice, CustomerPayment } from '@/payload-types';

interface PageProps {
  params: Promise<{ tenant: string; id: string }>;
}

export default async function CustomerDetailPage({ params }: PageProps) {
  const { tenant: tenantSlug, id } = await params;
  const customerId = Number(id);
  if (!Number.isFinite(customerId)) {
    notFound();
  }

  let tenant: Awaited<ReturnType<typeof getTenantBySlug>> = null;
  let detail: Awaited<ReturnType<typeof getCustomerDetail>> | null = null;
  let effectiveRate = 1;

  try {
    tenant = await getTenantBySlug(tenantSlug);
    if (tenant) {
      const [fetchedDetail, rateData] = await Promise.all([
        getCustomerDetail(tenant.id, customerId),
        resolveEffectiveRate(
          tenant.currencyConfig
            ? {
                manualExchangeRate: tenant.currencyConfig.manualExchangeRate ?? undefined,
                autoSyncRate: tenant.currencyConfig.autoSyncRate ?? undefined,
              }
            : undefined,
        ),
      ]);
      detail = fetchedDetail;
      effectiveRate = rateData.rate;
    }
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    if (error instanceof Error && error.message.includes('no encontrado')) {
      notFound();
    }
    throw error;
  }

  if (!tenant || !detail) {
    notFound();
  }

  const { customer, invoices, payments } = detail;
  const debtUSD = Number(customer.currentDebtUSD) || 0;
  const overdueUSD = Number(customer.overdueDebtUSD) || 0;
  const creditLimit = Number(customer.creditLimitUSD) || 0;
  const creditUsePct =
    customer.creditAllowed && creditLimit > 0
      ? Math.min(100, (debtUSD / creditLimit) * 100)
      : null;
  const overdueSharePct = debtUSD > 0 ? (overdueUSD / debtUSD) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header (fuera de impresión) */}
      <div className="no-print">
        <ErpPageHeader
          title={customer.name}
          breadcrumbHref={`/${tenantSlug}/erp/customers`}
          breadcrumbLabel="Clientes & Cartera"
          actions={
            <>
              {customer.whatsappDebtUrl && debtUSD > 0 && (
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={customer.whatsappDebtUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    Cobranza WhatsApp
                  </a>
                </Button>
              )}
              <PrintButton label="Imprimir Estado de Cuenta" />
            </>
          }
        />
      </div>

      {/* Estado de cuenta imprimible */}
      <div className="print-area space-y-6">
        {/* Ficha del cliente */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{customer.name}</h1>
              <p className="text-xs font-mono text-muted-foreground">{customer.taxId}</p>
              <p className="text-xs text-muted-foreground">
                {customer.phone} {customer.email ? `· ${customer.email}` : ''}
              </p>
              {customer.address && <p className="text-xs text-muted-foreground/80">{customer.address}</p>}
            </div>
            <div className="text-right space-y-1">
              <div className="text-xs uppercase font-semibold text-muted-foreground">Deuda Total</div>
              <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
                {formatUSD(debtUSD)}
              </div>
              <div className="text-xs font-mono text-muted-foreground">
                ≈ {formatVES(debtUSD * effectiveRate)}
              </div>
              {overdueUSD > 0 && (
                <div className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                  Vencida: {formatUSD(overdueUSD)}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border-t border-border pt-3">
            <div>
              <span className="text-muted-foreground block">Crédito</span>
              <span className="text-foreground font-semibold">
                {customer.creditAllowed ? 'Habilitado' : 'Sin crédito'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Límite</span>
              <span className="text-foreground font-semibold font-mono">
                {formatUSD(creditLimit)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Días de gracia</span>
              <span className="text-foreground font-semibold font-mono">
                {Number(customer.creditDays) || 0} días
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Tier de precio</span>
              <span className="text-foreground font-semibold capitalize">
                {customer.priceTier || 'retail'}
              </span>
            </div>
          </div>

          {/* Salud de crédito: utilización del límite + porción vencida */}
          {creditUsePct !== null && (
            <div className="border-t border-border pt-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Utilización de crédito</span>
                <span
                  className={`font-mono font-semibold tabular-nums ${
                    creditUsePct >= 100
                      ? 'text-rose-600 dark:text-rose-400'
                      : creditUsePct >= 75
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-foreground'
                  }`}
                >
                  {creditUsePct.toFixed(0)}% · {formatUSD(debtUSD)} / {formatUSD(creditLimit)}
                </span>
              </div>
              <Progress
                value={creditUsePct}
                aria-label={`Utilización de crédito: ${creditUsePct.toFixed(0)}%`}
              />
              {overdueUSD > 0 && (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <div
                      className="h-full bg-rose-500"
                      style={{ width: `${overdueSharePct}%` }}
                    />
                  </div>
                  <span>
                    {overdueSharePct.toFixed(0)}% de la deuda está vencida ({formatUSD(overdueUSD)})
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Facturas */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-foreground">Facturas</h2>
            </div>
            <span className="text-xs text-muted-foreground">{invoices.length} registro(s)</span>
          </div>
          {invoices.length === 0 ? (
            <p className="text-xs text-muted-foreground p-4">Sin facturas registradas.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Factura</TableHead>
                    <TableHead>Emisión</TableHead>
                    <TableHead className="text-right">Total USD</TableHead>
                    <TableHead className="text-right">Saldo USD</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv: Invoice) => (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <Link
                          href={`/${tenantSlug}/erp/invoices/${inv.id}`}
                          className="font-mono font-bold underline decoration-border underline-offset-2 hover:decoration-foreground"
                        >
                          {inv.invoiceNumber}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(inv.issueDate).toLocaleDateString('es-VE')}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatUSD(Number(inv.totalUSD) || 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400">
                        {formatUSD(Number(inv.balanceUSD) || 0)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={
                            inv.status === 'paid'
                              ? 'emerald'
                              : inv.status === 'partially_paid'
                                ? 'amber'
                                : inv.status === 'voided'
                                  ? 'rose'
                                  : 'indigo'
                          }
                          size="sm"
                          dot
                        >
                          {inv.status === 'paid'
                            ? 'Pagada'
                            : inv.status === 'partially_paid'
                              ? 'Parcial'
                              : inv.status === 'voided'
                                ? 'Anulada'
                                : 'Emitida'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Pagos */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-foreground">Pagos Recibidos</h2>
            </div>
            <span className="text-xs text-muted-foreground">{payments.length} pago(s)</span>
          </div>
          {payments.length === 0 ? (
            <p className="text-xs text-muted-foreground p-4">Sin pagos registrados.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Recibo</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Monto USD</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p: CustomerPayment) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono font-bold">{p.paymentNumber}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(p.paymentDate).toLocaleDateString('es-VE')}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {formatUSD(Number(p.totalUSD) || 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
