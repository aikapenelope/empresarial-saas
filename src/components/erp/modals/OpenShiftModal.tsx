'use client';

import React, { useState } from 'react';
import { useSyncOnKeyChange } from '../hooks/useSyncOnKeyChange';
import { Modal } from './Modal';
import { toast } from 'sonner';
import { openCashShiftAction } from '@/actions/erpActions';
import { Loader2, DollarSign } from 'lucide-react';

interface OpenShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: number;
  tenantSlug: string;
  cashRegisters: Array<{ id: number; name: string; code: string; currentStatus: string }>;
  defaultCashRegisterId?: number;
}

export function OpenShiftModal({
  isOpen,
  onClose,
  tenantId,
  tenantSlug,
  cashRegisters,
  defaultCashRegisterId,
}: OpenShiftModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closedRegisters = cashRegisters.filter((cr) => cr.currentStatus !== 'open');

  const [cashRegisterId, setCashRegisterId] = useState<number>(0);
  const [openingFloatUSD, setOpeningFloatUSD] = useState<number>(0);
  const [openingFloatVES, setOpeningFloatVES] = useState<number>(0);
  const [notes, setNotes] = useState('');

  // Al abrir el modal: seleccionar la caja pedida (o la primera cerrada) y
  // resetear el fondo. Ajuste de estado en render (patrón oficial de React)
  // en lugar de useEffect.
  useSyncOnKeyChange(`${isOpen}:${defaultCashRegisterId ?? 'none'}`, () => {
    if (!isOpen) return;
    setError(null);
    setOpeningFloatUSD(0);
    setOpeningFloatVES(0);
    setNotes('');
    setCashRegisterId(
      defaultCashRegisterId ??
        closedRegisters[0]?.id ??
        cashRegisters[0]?.id ??
        0,
    );
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cashRegisterId) {
      setError('Debes seleccionar una caja registradora.');
      return;
    }

    setLoading(true);
    setError(null);

    const res = await openCashShiftAction({
      tenantId,
      tenantSlug,
      cashRegisterId,
      openingFloatUSD,
      openingFloatVES,
      notes: notes || undefined,
    });

    setLoading(false);

    if (res.success) {
      toast.success('Turno abierto. La caja está habilitada para vender.');
      onClose();
    } else {
      setError(res.error || 'Error al abrir el turno de caja');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Abrir Turno de Caja"
      description="Declara el fondo de apertura (caja chica inicial) y habilita la caja para recaudar. El arqueo ciego del cierre comparará contra este fondo."
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-rose-300">
            {error}
          </div>
        )}

        <div>
          <label className="block font-semibold text-foreground mb-1">Caja Registradora a Abrir *</label>
          <select
            value={cashRegisterId}
            onChange={(e) => setCashRegisterId(Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground focus:border-ring focus:outline-none"
          >
            {cashRegisters.map((cr) => (
              <option key={cr.id} value={cr.id} disabled={cr.currentStatus === 'open'}>
                {cr.name} ({cr.code}) — {cr.currentStatus === 'open' ? 'Ya tiene turno abierto' : 'Disponible'}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-3">
          <div className="flex items-center gap-1.5 text-foreground font-semibold uppercase text-[10px] tracking-wider">
            <DollarSign className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Fondo de Apertura</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-muted-foreground mb-1">Efectivo USD ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={openingFloatUSD}
                onChange={(e) => setOpeningFloatUSD(Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground font-mono"
              />
            </div>

            <div>
              <label className="block font-medium text-muted-foreground mb-1">Efectivo Bolívares (Bs.)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={openingFloatVES}
                onChange={(e) => setOpeningFloatVES(Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground font-mono"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block font-semibold text-foreground mb-1">Observaciones de Apertura</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej. Turno mañana, cajero responsable"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border hover:bg-background text-foreground font-semibold"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-all disabled:opacity-50"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>Abrir Turno</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
