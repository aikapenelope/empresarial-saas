import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Wallet, ArrowLeft, Building2 } from 'lucide-react';
import { getTenantBySlug, getCashRegistersWithDetails } from '@/utilities/erpData';
import { Badge } from '@/components/erp/Badge';

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function CashRegistersPage({ params }: PageProps) {
  const { tenant: tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);

  if (!tenant) {
    notFound();
  }

  const registers = await getCashRegistersWithDetails(tenant.id);
  const openCount = registers.filter((r) => r.currentStatus === 'open').length;

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
            <span className="text-xs font-semibold text-indigo-400">Tesorería & Cajas</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Puntos de Venta & Cajas Registradoras
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Monitoreo de turnos de caja, recaudación multimétodo y control de arqueo ciego (USD, VES, Punto, Zelle, Binance).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/admin/collections/cash-registers/create"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors shadow-sm"
          >
            + Nueva Caja
          </Link>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Total Cajas Registradoras</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-white">{registers.length}</span>
            <span className="text-xs text-slate-400">en operación</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Cajas en Turno Abierto</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-emerald-400">{openCount}</span>
            <span className="text-xs text-slate-400">recaudando activamente</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
          <p className="text-[11px] uppercase font-semibold text-slate-400">Cajas Cerradas / Arqueadas</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-slate-300">{registers.length - openCount}</span>
            <span className="text-xs text-slate-400">listas para apertura de turno</span>
          </div>
        </div>
      </div>

      {/* Grid de Cajas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {registers.map((cr) => {
          const warehouseName =
            typeof cr.warehouse === 'object' && cr.warehouse !== null
              ? (cr.warehouse as { name: string }).name
              : 'Almacén Principal';
          const isOpen = cr.currentStatus === 'open';

          return (
            <div
              key={cr.id}
              className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-5 backdrop-blur space-y-4 hover:border-slate-700 transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-indigo-400">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-white">{cr.name}</h3>
                    <p className="text-xs font-mono text-slate-400">{cr.code}</p>
                  </div>
                </div>

                <Badge variant={isOpen ? 'emerald' : 'slate'} size="sm">
                  {isOpen ? 'Abierta' : 'Cerrada'}
                </Badge>
              </div>

              <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" />
                    Depósito / Sucursal:
                  </span>
                  <span className="font-medium text-slate-200">{warehouseName}</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Estado Operativo:</span>
                  <span className="font-medium text-slate-200">{cr.active ? 'Habilitada' : 'Inactiva'}</span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <Link
                  href="/admin/collections/cash-closures"
                  className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  Ver Historial de Cierres &rarr;
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
