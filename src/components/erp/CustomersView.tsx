'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Users,
  Search,
  Plus,
  DollarSign,
  MessageCircle,
} from 'lucide-react';
import { formatUSD, formatVES } from './KpiCard';
import { Badge } from './Badge';
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
  effectiveRate,
}: CustomersViewProps) {
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
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
            <span className="text-xs font-semibold text-indigo-400">Clientes & Cartera CxC</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Gestión de Clientes & Cobranzas
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Monitoreo bimonetario de saldos deudores, días de crédito y gestión de cobranza directa por WhatsApp.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setSelectedCustomerId(undefined);
              setIsPaymentModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
            <span>Registrar Cobro</span>
          </button>
          <button
            onClick={() => setIsCustomerModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors shadow-sm shadow-indigo-500/20"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>+ Nuevo Cliente</span>
          </button>
        </div>
      </div>

      {/* KPIs de Cartera */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Cartera Deudora Total</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-white">{formatUSD(totalDebtUSD)}</span>
            <span className="text-xs font-medium text-emerald-400">≈ {formatVES(totalDebtVES)}</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Cartera Vencida</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-rose-400">{formatUSD(overdueDebtUSD)}</span>
            <span className="text-xs text-slate-400">({debtorsCount} deudores)</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Padrón de Clientes</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-white">{customers.length}</span>
            <span className="text-xs text-slate-400">registrados en el inquilino</span>
          </div>
        </div>
      </div>

      {/* Búsqueda y Filtros */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente, RIF o teléfono..."
            className="w-full rounded-lg border border-slate-800 bg-slate-900/80 pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto text-xs">
          <button
            onClick={() => setFilterDebtorsOnly(false)}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              !filterDebtorsOnly
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Todos ({customers.length})
          </button>
          <button
            onClick={() => setFilterDebtorsOnly(true)}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filterDebtorsOnly
                ? 'bg-amber-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Sólo con Saldo Deudor ({debtorsCount})
          </button>
        </div>
      </div>

      {/* Tabla de Clientes */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden backdrop-blur">
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Listado de Clientes & Balances</h2>
          <span className="text-xs text-slate-400">Ordenado por mayor saldo deudor</span>
        </div>

        {filteredCustomers.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs space-y-3">
            <Users className="h-8 w-8 mx-auto text-slate-600" />
            <p>No se encontraron clientes registrados en este inquilino.</p>
            <button
              onClick={() => setIsCustomerModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              + Registrar Primer Cliente
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                  <th className="p-3">Razón Social / Contacto</th>
                  <th className="p-3">RIF / Cédula</th>
                  <th className="p-3">Segmento</th>
                  <th className="p-3 text-right">Límite Crédito</th>
                  <th className="p-3 text-right">Deuda Actual USD</th>
                  <th className="p-3 text-right">Deuda Actual VES</th>
                  <th className="p-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredCustomers.map((c) => {
                  const debt = Number(c.currentDebtUSD) || 0;
                  const debtVES = Number(c.currentDebtVES) || debt * effectiveRate;
                  const overdue = Number(c.overdueDebtUSD) || 0;

                  return (
                    <tr key={c.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3">
                        <div className="font-semibold text-white">{c.name}</div>
                        <div className="text-[11px] text-slate-400">{c.phone || c.email || 'Sin contacto'}</div>
                      </td>
                      <td className="p-3 font-mono text-slate-300">{c.taxId}</td>
                      <td className="p-3">
                        <Badge
                          variant={
                            c.status === 'vip'
                              ? 'emerald'
                              : c.status === 'recurring'
                                ? 'indigo'
                                : 'slate'
                          }
                          size="sm"
                        >
                          {c.status || 'general'}
                        </Badge>
                      </td>
                      <td className="p-3 text-right font-mono text-slate-400">
                        {c.creditAllowed ? formatUSD(Number(c.creditLimitUSD) || 0) : 'Contado'}
                      </td>
                      <td className="p-3 text-right font-mono font-bold">
                        <span className={debt > 0 ? (overdue > 0 ? 'text-rose-400' : 'text-amber-400') : 'text-slate-400'}>
                          {formatUSD(debt)}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono text-slate-300">
                        {debt > 0 ? formatVES(debtVES) : 'Bs. 0,00'}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {debt > 0 && (
                            <button
                              onClick={() => handleOpenPayment(c.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white text-xs font-semibold transition-colors"
                            >
                              <DollarSign className="h-3 w-3" />
                              <span>Cobrar</span>
                            </button>
                          )}
                          {c.whatsappDebtUrl && debt > 0 && (
                            <a
                              href={c.whatsappDebtUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors shadow-sm"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                              <span>WhatsApp</span>
                            </a>
                          )}
                          {debt <= 0 && (
                            <span className="text-[11px] text-slate-400 font-medium">Al día</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Nuevo Cliente */}
      <CustomerModal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
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
