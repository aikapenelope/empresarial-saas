'use client';

import React, { useState } from 'react';
import { Modal } from './Modal';
import { createCashRegisterAction } from '@/actions/erpActions';
import { Loader2 } from 'lucide-react';

interface CashRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: number;
  tenantSlug: string;
  warehouses: Array<{ id: number; name: string; code: string }>;
}

export function CashRegisterModal({
  isOpen,
  onClose,
  tenantId,
  tenantSlug,
  warehouses,
}: CashRegisterModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [warehouseId, setWarehouseId] = useState<number>(warehouses[0]?.id || 1);

  const handleGenerateCode = () => {
    const rand = Math.floor(10 + Math.random() * 90);
    setCode(`CJ-${rand}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('El nombre de la caja es obligatorio.');
      return;
    }

    setLoading(true);
    setError(null);

    const res = await createCashRegisterAction({
      tenantId,
      tenantSlug,
      name,
      code: code || `CJ-${Date.now().toString().slice(-3)}`,
      warehouseId,
    });

    setLoading(false);

    if (res.success) {
      setName('');
      setCode('');
      onClose();
    } else {
      setError(res.error || 'Error al crear caja registradora');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Nueva Caja Registradora / POS"
      description="Registra un nuevo punto de venta para control de turnos y arqueos ciegos."
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-rose-300">
            {error}
          </div>
        )}

        <div>
          <label className="block font-semibold text-foreground mb-1">Nombre de la Caja *</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Caja Principal Mostrador"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="font-semibold text-foreground">Código de Caja *</label>
            <button
              type="button"
              onClick={handleGenerateCode}
              className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold"
            >
              Generar Código
            </button>
          </div>
          <input
            type="text"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Ej. CJ-01"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none font-mono"
          />
        </div>

        <div>
          <label className="block font-semibold text-foreground mb-1">Depósito / Almacén Vinculado *</label>
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground focus:border-ring focus:outline-none"
          >
            {warehouses.length > 0 ? (
              warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))
            ) : (
              <option value={1}>Almacén Principal (Predeterminado)</option>
            )}
          </select>
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
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all disabled:opacity-50"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>Registrar Caja</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
