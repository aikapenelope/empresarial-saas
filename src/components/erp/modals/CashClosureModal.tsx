'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { createCashClosureAction } from '@/actions/erpActions';
import { Loader2, DollarSign, CreditCard, Smartphone } from 'lucide-react';

interface CashClosureModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: number;
  tenantSlug: string;
  cashRegisters: Array<{ id: number; name: string; code: string; currentStatus: string }>;
  defaultCashRegisterId?: number;
}

export function CashClosureModal({
  isOpen,
  onClose,
  tenantId,
  tenantSlug,
  cashRegisters,
  defaultCashRegisterId,
}: CashClosureModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cashRegisterId, setCashRegisterId] = useState<number>(
    defaultCashRegisterId || cashRegisters[0]?.id || 0,
  );

  const [physicalUSD, setPhysicalUSD] = useState<number>(0);
  const [physicalVES, setPhysicalVES] = useState<number>(0);
  const [physicalPOS, setPhysicalPOS] = useState<number>(0);
  const [physicalPagoMovil, setPhysicalPagoMovil] = useState<number>(0);
  const [physicalTransfer, setPhysicalTransfer] = useState<number>(0);
  const [physicalZelle, setPhysicalZelle] = useState<number>(0);
  const [physicalBinance, setPhysicalBinance] = useState<number>(0);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (defaultCashRegisterId) {
      setCashRegisterId(defaultCashRegisterId);
    }
  }, [defaultCashRegisterId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cashRegisterId) {
      setError('Debes seleccionar una caja registradora.');
      return;
    }

    setLoading(true);
    setError(null);

    const res = await createCashClosureAction({
      tenantId,
      tenantSlug,
      cashRegisterId,
      physicalUSD,
      physicalVES,
      physicalPOS,
      physicalPagoMovil,
      physicalTransfer,
      physicalZelle,
      physicalBinance,
      notes: notes || undefined,
    });

    setLoading(false);

    if (res.success) {
      setPhysicalUSD(0);
      setPhysicalVES(0);
      setPhysicalPOS(0);
      setPhysicalPagoMovil(0);
      setPhysicalTransfer(0);
      setPhysicalZelle(0);
      setPhysicalBinance(0);
      setNotes('');
      onClose();
    } else {
      setError(res.error || 'Error al ejecutar arqueo y cierre de caja');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Arqueo Ciego & Cierre de Turno"
      description="El cajero declara los fondos físicos y digitales contados al final del turno sin ver el balance teórico del sistema."
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-rose-300">
            {error}
          </div>
        )}

        <div>
          <label className="block font-semibold text-slate-300 mb-1">Caja Registradora a Cerrar *</label>
          <select
            value={cashRegisterId}
            onChange={(e) => setCashRegisterId(Number(e.target.value))}
            className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
          >
            {cashRegisters.map((cr) => (
              <option key={cr.id} value={cr.id}>
                {cr.name} ({cr.code}) — {cr.currentStatus === 'open' ? 'Turno Abierto' : 'Cerrada'}
              </option>
            ))}
          </select>
        </div>

        {/* Declaración de Efectivo */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 space-y-3">
          <div className="flex items-center gap-1.5 text-slate-300 font-semibold uppercase text-[10px] tracking-wider">
            <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
            <span>Efectivo Físico en Gaveta</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-400 mb-1">Billetes USD ($)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={physicalUSD}
                onChange={(e) => setPhysicalUSD(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white font-mono"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-400 mb-1">Billetes Bolívares (Bs.)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={physicalVES}
                onChange={(e) => setPhysicalVES(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white font-mono"
              />
            </div>
          </div>
        </div>

        {/* Declaración Canales Bancarios VES */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 space-y-3">
          <div className="flex items-center gap-1.5 text-slate-300 font-semibold uppercase text-[10px] tracking-wider">
            <CreditCard className="h-3.5 w-3.5 text-indigo-400" />
            <span>Canales Bancarios (VES)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-medium text-slate-400 mb-1">Total Lote POS / Débito (Bs.)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={physicalPOS}
                onChange={(e) => setPhysicalPOS(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white font-mono"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-400 mb-1">Total Pago Móvil Declarado (Bs.)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={physicalPagoMovil}
                onChange={(e) => setPhysicalPagoMovil(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white font-mono"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-400 mb-1">Total Transferencias (Bs.)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={physicalTransfer}
                onChange={(e) => setPhysicalTransfer(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white font-mono"
              />
            </div>
          </div>
        </div>

        {/* Declaración Moneda Digital USD */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 space-y-3">
          <div className="flex items-center gap-1.5 text-slate-300 font-semibold uppercase text-[10px] tracking-wider">
            <Smartphone className="h-3.5 w-3.5 text-amber-400" />
            <span>Canales Digitales en Divisa (USD)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-400 mb-1">Total Zelle Declarado ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={physicalZelle}
                onChange={(e) => setPhysicalZelle(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white font-mono"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-400 mb-1">Total Binance Pay USDT ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={physicalBinance}
                onChange={(e) => setPhysicalBinance(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white font-mono"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block font-semibold text-slate-300 mb-1">Observaciones / Incidencias del Turno</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej. Cierre de turno sin novedades, corte de luz 15 mins a las 4pm"
            className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 font-semibold"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold transition-all disabled:opacity-50"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>Cerrar Turno & Registrar Arqueo</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
