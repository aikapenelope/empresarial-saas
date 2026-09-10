'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Users,
  Search,
  Plus,
  DollarSign,
  MessageCircle,
  Wallet,
  TriangleAlert,
  Contact,
} from 'lucide-react';
import { EmptyState } from './EmptyState';
import { formatUSD, formatVES } from './format';
import { Badge } from './Badge';
import { KpiCard } from './KpiCard';
import { ErpPageHeader } from './ErpPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CustomerModal } from './modals/CustomerModal';
import { PaymentModal } from './modals/PaymentModal';
import type { Customer } from '@/payload-types';

interface CustomerWithUrl extends Customer {
  whatsappDebtUrl?: string | null;
}

interface CustomersViewProps {
  tenantId: number;
  tenantSlug: string;
  customers: CustomerWithUrl[];
  totalDebtUSD: number;
  totalDebtVES: number;
  overdueDebtUSD: number;
  debtorsCount: number;
  overdueDebtorsCount: number;
  effectiveRate: number;
}

export function CustomersView({
  tenantId,
  tenantSlug,
  customers,
  totalDebtUSD,
  totalDebtVES,
  overdueDebtUSD,
  debtorsCount,
  overdueDebtorsCount,
  effectiveRate,
}: CustomersViewProps) {
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<
    | {
        id: number;
        name: string;
        taxId: string;
        phone: string;
        email?: string | null;
        address?: string | null;
        status?: string | null;
        creditAllowed?: boolean | null;
        creditLimitUSD?: number | null;
        creditDays?: number | null;
        priceTier?: string | null;
      }
    | undefined
  >(undefined);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | undefined>(undefined);

  const [search, setSearch] = useState('');
  const [filterDebtorsOnly, setFilterDebtorsOnly] = useState(false);

  const filteredCustomers = customers.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.taxId.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone && c.phone.includes(search)) ||
      (c.email && c.email.toLowerCase().includes(search.toLowerCase()));

    const debt = Number(c.currentDebtUSD) || 0;
    const matchesDebt = filterDebtorsOnly ? debt > 0 : true;

    return matchesSearch && matchesDebt;
  });

  const handleOpenPayment = (customerId: number) => {
    setSelectedCustomerId(customerId);
    setIsPaymentModalOpen(true);
  };

  const sanitizedCustomersForPayment = customers.map((c) => ({
    id: c.id,
    name: c.name,
    taxId: c.taxId,
    currentDebtUSD: c.currentDebtUSD,
  }));

  return (
    <div className="space-y-6">
      <ErpPageHeader
        title="Gestión de Clientes & Cobranzas"
        description="Monitoreo bimonetario de saldos deudores, días de crédito y gestión de cobranza directa por WhatsApp."
        breadcrumbHref={`/${tenantSlug}/erp`}
        section="Clientes & Cartera CxC"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedCustomerId(undefined);
                setIsPaymentModalOpen(true);
              }}
            >
              <DollarSign className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              Registrar Cobro
            </Button>
            <Button size="sm" onClick={() => setIsCustomerModalOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Nuevo Cliente
            </Button>
          </>
        }
      />

      {/* KPIs de Cartera */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Cartera Deudora Total"
          valueUSD={totalDebtUSD}
          valueVES={totalDebtVES}
          icon={Wallet}
        />
        <KpiCard
          title="Cartera Vencida"
          valueUSD={overdueDebtUSD}
          icon={TriangleAlert}
          tone="destructive"
          description={`${overdueDebtorsCount} con deuda vencida`}
        />
        <KpiCard
          title="Padrón de Clientes"
          valueUSD={String(customers.length)}
          icon={Contact}
          description="Registrados en el inquilino"
        />
      </div>

      {/* Búsqueda y Filtros */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente, RIF o teléfono..."
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            size="sm"
            variant={filterDebtorsOnly ? 'outline' : 'default'}
            onClick={() => setFilterDebtorsOnly(false)}
          >
            Todos ({customers.length})
          </Button>
          <Button
            size="sm"
            variant={filterDebtorsOnly ? 'default' : 'outline'}
            onClick={() => setFilterDebtorsOnly(true)}
          >
            Sólo con Saldo Deudor ({debtorsCount})
          </Button>
        </div>
      </div>

      {/* Tabla de Clientes */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Listado de Clientes & Balances</h2>
          <span className="text-xs text-muted-foreground">Ordenado por mayor saldo deudor</span>
        </div>

        {filteredCustomers.length === 0 ? (
          <EmptyState icon={Users} title="No hay clientes registrados." description="Registra el primer cliente de este inquilino.">
            <Button size="sm" onClick={() => setIsCustomerModalOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Registrar Primer Cliente
            </Button>
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Razón Social / Contacto</TableHead>
                  <TableHead>RIF / Cédula</TableHead>
                  <TableHead>Segmento</TableHead>
                  <TableHead className="text-right">Límite Crédito</TableHead>
                  <TableHead className="text-right">Deuda Actual USD</TableHead>
                  <TableHead className="text-right">Deuda Actual VES</TableHead>
                  <TableHead className="text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.map((c) => {
                  const debt = Number(c.currentDebtUSD) || 0;
                  const debtVES = Number(c.currentDebtVES) || debt * effectiveRate;
                  const overdue = Number(c.overdueDebtUSD) || 0;
                  const creditLimit = Number(c.creditLimitUSD) || 0;
                  const creditUsePct =
                    c.creditAllowed && creditLimit > 0
                      ? Math.min(100, (debt / creditLimit) * 100)
                      : null;

                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link
                          href={`/${tenantSlug}/erp/customers/${c.id}`}
                          className="font-semibold text-foreground hover:underline underline-offset-2"
                        >
                          {c.name}
                        </Link>
                        <div className="text-[11px] text-muted-foreground">{c.phone || c.email || 'Sin contacto'}</div>
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground">{c.taxId}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            c.status === 'vip'
                              ? 'emerald'
                              : c.status === 'recurring'
                                ? 'indigo'
                                : 'slate'
                          }
                          size="sm"
                          dot={c.status === 'vip'}
                        >
                          {c.status || 'general'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {c.creditAllowed ? formatUSD(creditLimit) : 'Contado'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <span
                          className={
                            debt > 0
                              ? overdue > 0
                                ? 'font-bold text-rose-600 dark:text-rose-400'
                                : 'font-bold text-amber-600 dark:text-amber-400'
                              : 'text-muted-foreground'
                          }
                        >
                          {formatUSD(debt)}
                        </span>
                        {creditUsePct !== null && debt > 0 && (
                          <Progress
                            value={creditUsePct}
                            className="mt-1.5 h-1"
                            aria-label={`Utilización de crédito de ${c.name}: ${creditUsePct.toFixed(0)}%`}
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {debt > 0 ? formatVES(debtVES) : 'Bs. 0,00'}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {debt > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2.5 text-xs"
                              onClick={() => handleOpenPayment(c.id)}
                            >
                              <DollarSign className="h-3 w-3" aria-hidden="true" />
                              Cobrar
                            </Button>
                          )}
                          {c.whatsappDebtUrl && debt > 0 && (
                            <Button size="sm" className="h-7 px-2.5 text-xs" asChild>
                              <a
                                href={c.whatsappDebtUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                WhatsApp
                              </a>
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              setEditingCustomer({
                                id: c.id,
                                name: c.name,
                                taxId: c.taxId,
                                phone: c.phone || '',
                                email: c.email,
                                address: c.address,
                                status: c.status,
                                creditAllowed: c.creditAllowed,
                                creditLimitUSD: c.creditLimitUSD,
                                creditDays: c.creditDays,
                                priceTier: c.priceTier,
                              });
                              setIsCustomerModalOpen(true);
                            }}
                          >
                            Editar
                          </Button>
                          {debt <= 0 && (
                            <span className="text-[11px] text-muted-foreground font-medium">Al día</span>
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

      {/* Modal Nuevo Cliente */}
      <CustomerModal
        isOpen={isCustomerModalOpen}
        onClose={() => {
          setIsCustomerModalOpen(false);
          setEditingCustomer(undefined);
        }}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        initial={editingCustomer}
      />

      {/* Modal Cobro */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        rate={effectiveRate}
        customers={sanitizedCustomersForPayment}
        defaultCustomerId={selectedCustomerId}
      />
    </div>
  );
}
