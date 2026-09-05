'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Wallet,
  Plus,
  Building2,
  Lock,
  History,
  Calendar,
} from 'lucide-react';
import { formatUSD, formatVES } from './KpiCard';
import { Badge } from './Badge';
import { CashRegisterModal } from './modals/CashRegisterModal';
import { CashClosureModal } from './modals/CashClosureModal';
import type { CashRegister, Warehouse, CashClosure } from '@/payload-types';

interface CashRegistersViewProps {
  tenantId: number;
  tenantSlug: string;
  registers: CashRegister[];
  warehouses: Warehouse[];
  closures: CashClosure[];
  openCount: number;
}

export function CashRegistersView({
  tenantId,
  tenantSlug,
  registers,
  warehouses,
  closures,
  openCount,
}: CashRegistersViewProps) {
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isClosureModalOpen, setIsClosureModalOpen] = useState(false);
  const [selectedRegisterId, setSelectedRegisterId] = useState<number | undefined>(undefined);

  const handleOpenClosure = (registerId?: number) => {
    setSelectedRegisterId(registerId || registers.find((r) => r.currentStatus === 'open')?.id || registers[0]?.id);
    setIsClosureModalOpen(true);
  };

  const sanitizedWarehouses = warehouses.map((w) => ({
    id: w.id,
    name: w.name,
    code: w.code,
  }));

  const sanitizedRegisters = registers.map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    currentStatus: r.currentStatus,
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
          {openCount > 0 && (
            <button
              onClick={() => handleOpenClosure()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
            >
              <Lock className="h-3.5 w-3.5 text-rose-400" />
              <span>Arqueo Ciego / Cierre</span>
            </button>
          )}
          <button
            onClick={() => setIsRegisterModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors shadow-sm shadow-indigo-500/20"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>+ Nueva Caja</span>
          </button>
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
              className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-5 backdrop-blur space-y-4 hover:border-slate-700 transition-all flex flex-col justify-between"
            >
              <div className="space-y-3">
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
              </div>

              <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                {isOpen ? (
                  <button
                    onClick={() => handleOpenClosure(cr.id)}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-rose-600/20 text-rose-300 border border-rose-500/30 hover:bg-rose-600 hover:text-white text-xs font-semibold transition-all"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    <span>Realizar Arqueo Ciego & Cierre</span>
                  </button>
                ) : (
                  <span className="text-[11px] text-slate-500 font-medium">
                    Turno cerrado (Listo para operar)
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Historial de Cierres de Caja & Arqueos Ciegos */}
      {closures.length > 0 && (
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden backdrop-blur space-y-3 p-5">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-white">Historial de Arqueos & Cierres de Turno</h2>
            </div>
            <span className="text-xs text-slate-400">{closures.length} cierres registrados</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                  <th className="p-3">Nro. Cierre</th>
                  <th className="p-3">Caja</th>
                  <th className="p-3">Fecha & Hora</th>
                  <th className="p-3 text-right">Efectivo USD</th>
                  <th className="p-3 text-right">Efectivo VES</th>
                  <th className="p-3 text-right">Lote POS (Bs.)</th>
                  <th className="p-3 text-right">Pago Móvil (Bs.)</th>
                  <th className="p-3 text-right">Zelle / Binance ($)</th>
                  <th className="p-3 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {closures.map((cl) => {
                  const regName =
                    typeof cl.cashRegister === 'object' && cl.cashRegister !== null
                      ? (cl.cashRegister as { name: string }).name
                      : 'Caja';

                  const declared = cl.declaredTotals;
                  const digitalUSD = (Number(declared?.zelleUSD) || 0) + (Number(declared?.binanceUSD) || 0);

                  return (
                    <tr key={cl.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3 font-mono font-bold text-white">{cl.closureNumber}</td>
                      <td className="p-3 text-slate-200 font-semibold">{regName}</td>
                      <td className="p-3 text-slate-400 text-[11px]">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-slate-500" />
                          <span>{new Date(cl.closedAt || cl.createdAt).toLocaleString('es-VE')}</span>
                        </div>
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-400">
                        {formatUSD(Number(declared?.cashUSD) || 0)}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-300">
                        {formatVES(Number(declared?.cashVES) || 0)}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-300">
                        {formatVES(Number(declared?.posVES) || 0)}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-300">
                        {formatVES(Number(declared?.pagoMovilVES) || 0)}
                      </td>
                      <td className="p-3 text-right font-mono text-indigo-300">
                        {formatUSD(digitalUSD)}
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant="slate" size="sm">
                          {cl.status === 'audited' ? 'Auditado' : 'Cerrado'}
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

      {/* Modales */}
      <CashRegisterModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        warehouses={sanitizedWarehouses}
      />

      <CashClosureModal
        isOpen={isClosureModalOpen}
        onClose={() => setIsClosureModalOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        cashRegisters={sanitizedRegisters}
        defaultCashRegisterId={selectedRegisterId}
      />
    </div>
  );
}
