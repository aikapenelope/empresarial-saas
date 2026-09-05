'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Truck,
  Search,
  Plus,
  Receipt,
  Calendar,
} from 'lucide-react';
import { formatUSD, formatVES } from './KpiCard';
import { Badge } from './Badge';
import { SupplierModal } from './modals/SupplierModal';
import type { Supplier, PurchaseInvoice } from '@/payload-types';

interface SuppliersViewProps {
  tenantId: number;
  tenantSlug: string;
  suppliers: Supplier[];
  purchaseInvoices: PurchaseInvoice[];
  totalPayablesUSD: number;
  totalPayablesVES: number;
  effectiveRate: number;
}

export function SuppliersView({
  tenantId,
  tenantSlug,
  suppliers,
  purchaseInvoices,
  totalPayablesUSD,
  totalPayablesVES,
  effectiveRate,
}: SuppliersViewProps) {
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredSuppliers = suppliers.filter((s) => {
    return (
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.taxId.toLowerCase().includes(search.toLowerCase()) ||
      (s.contactName && s.contactName.toLowerCase().includes(search.toLowerCase()))
    );
  });

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
            <span className="text-xs font-semibold text-indigo-400">Proveedores & CxP</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Gestión de Proveedores & Cuentas por Pagar
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Registro de compras a crédito, facturas por pagar y recepción de mercancía a almacén.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSupplierModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors shadow-sm shadow-indigo-500/20"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>+ Nuevo Proveedor</span>
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Deuda Comercial por Pagar</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-amber-400">{formatUSD(totalPayablesUSD)}</span>
            <span className="text-xs font-medium text-slate-300">≈ {formatVES(totalPayablesVES)}</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Facturas de Compra Pendientes</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-white">{purchaseInvoices.length}</span>
            <span className="text-xs text-slate-400">compromisos activos</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Padrón de Proveedores</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-white">{suppliers.length}</span>
            <span className="text-xs text-slate-400">proveedores registrados</span>
          </div>
        </div>
      </div>

      {/* Barra de Búsqueda */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por proveedor, RIF o contacto..."
            className="w-full rounded-lg border border-slate-800 bg-slate-900/80 pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Tabla de Proveedores */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden backdrop-blur">
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Directorio de Proveedores Comerciales</h2>
          <span className="text-xs text-slate-400">{filteredSuppliers.length} registrados</span>
        </div>

        {filteredSuppliers.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs space-y-3">
            <Truck className="h-8 w-8 mx-auto text-slate-600" />
            <p>No hay proveedores registrados en este inquilino.</p>
            <button
              onClick={() => setIsSupplierModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              + Registrar Primer Proveedor
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                  <th className="p-3">Razón Social / Contacto</th>
                  <th className="p-3">RIF / Cédula</th>
                  <th className="p-3">Condiciones de Crédito</th>
                  <th className="p-3 text-right">Límite Crédito</th>
                  <th className="p-3 text-right">Deuda Pendiente USD</th>
                  <th className="p-3 text-right">Deuda Pendiente VES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredSuppliers.map((s) => {
                  const debt = Number(s.currentDebtUSD) || 0;
                  const debtVES = Number(s.currentDebtVES) || debt * effectiveRate;

                  return (
                    <tr key={s.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3">
                        <div className="font-semibold text-white">{s.name}</div>
                        <div className="text-[11px] text-slate-400">
                          {s.contactName ? `${s.contactName} · ` : ''}
                          {s.phone || s.email || 'Sin contacto'}
                        </div>
                      </td>
                      <td className="p-3 font-mono text-slate-300">{s.taxId}</td>
                      <td className="p-3">
                        {s.creditAllowed ? (
                          <Badge variant="indigo" size="sm">
                            {s.creditDays} días plazo
                          </Badge>
                        ) : (
                          <Badge variant="slate" size="sm">
                            Contado
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-400">
                        {s.creditAllowed ? formatUSD(Number(s.creditLimitUSD) || 0) : '$ 0,00'}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-amber-400">
                        {formatUSD(debt)}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-300">
                        {formatVES(debtVES)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Facturas de Compra Pendientes */}
      {purchaseInvoices.length > 0 && (
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden backdrop-blur space-y-3 p-5">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-white">Facturas de Compra Pendientes por Pagar</h2>
            </div>
            <span className="text-xs text-slate-400">{purchaseInvoices.length} facturas</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                  <th className="p-3">Factura</th>
                  <th className="p-3">Proveedor</th>
                  <th className="p-3">Emisión & Vencimiento</th>
                  <th className="p-3 text-right">Total USD</th>
                  <th className="p-3 text-right">Saldo por Pagar</th>
                  <th className="p-3 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {purchaseInvoices.map((pinv) => {
                  const supName =
                    typeof pinv.supplier === 'object' && pinv.supplier !== null
                      ? (pinv.supplier as { name: string }).name
                      : 'Proveedor';

                  return (
                    <tr key={pinv.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3 font-mono font-bold text-white">{pinv.invoiceNumber}</td>
                      <td className="p-3 font-semibold text-slate-200">{supName}</td>
                      <td className="p-3 text-slate-400 text-[11px]">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-slate-500" />
                          <span>{new Date(pinv.issueDate).toLocaleDateString('es-VE')}</span>
                        </div>
                      </td>
                      <td className="p-3 text-right font-mono text-slate-200">
                        {formatUSD(Number(pinv.totalUSD) || 0)}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-amber-400">
                        {formatUSD(Number(pinv.balanceUSD) || 0)}
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant={pinv.status === 'received' ? 'amber' : 'indigo'} size="sm">
                          {pinv.status === 'received' ? 'Por Pagar' : pinv.status === 'partially_paid' ? 'Parcial' : 'Borrador'}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Nuevo Proveedor */}
      <SupplierModal
        isOpen={isSupplierModalOpen}
        onClose={() => setIsSupplierModalOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
      />
    </div>
  );
}
