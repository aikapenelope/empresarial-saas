'use client';

import React, { useState } from 'react';
import { Modal } from './Modal';
import { createSupplierAction } from '@/actions/erpActions';
import { Loader2 } from 'lucide-react';

interface SupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: number;
  tenantSlug: string;
}

export function SupplierModal({ isOpen, onClose, tenantId, tenantSlug }: SupplierModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [contactName, setContactName] = useState('');
  const [creditDays, setCreditDays] = useState(30);
  const [creditLimitUSD, setCreditLimitUSD] = useState(1000);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !taxId.trim()) {
      setError('La razón social y el RIF son obligatorios.');
      return;
    }

    setLoading(true);
    setError(null);

    const res = await createSupplierAction({
      tenantId,
      tenantSlug,
      name,
      taxId,
      phone: phone || undefined,
      email: email || undefined,
      contactName: contactName || undefined,
      creditDays: Number(creditDays) || 0,
      creditLimitUSD: Number(creditLimitUSD) || 0,
    });

    setLoading(false);

    if (res.success) {
      setName('');
      setTaxId('');
      setPhone('');
      setEmail('');
      setContactName('');
      onClose();
    } else {
      setError(res.error || 'Error al registrar proveedor');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Nuevo Proveedor Comercial (CxP)"
      description="Registra un proveedor para compras a crédito, órdenes de compra y facturas de insumos."
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-rose-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-300 mb-1">Razón Social / Empresa *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Distribuidora Central, C.A."
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-300 mb-1">RIF / Cédula Fiscal *</label>
            <input
              type="text"
              required
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              placeholder="Ej. J-98765432-1"
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-300 mb-1">Teléfono / WhatsApp</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ej. +584141234567"
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none font-mono"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-300 mb-1">Correo Electrónico</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ventas@proveedor.com"
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block font-semibold text-slate-300 mb-1">Persona de Contacto / Asesor</label>
          <input
            type="text"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="Ej. Lic. Carlos Mendoza (Gerente de Cuentas)"
            className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl border border-slate-800 bg-slate-950/60">
          <div>
            <label className="block font-semibold text-slate-300 mb-1">Días de Crédito Otorgados</label>
            <input
              type="number"
              min="0"
              value={creditDays}
              onChange={(e) => setCreditDays(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white font-mono"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-300 mb-1">Límite de Crédito (USD)</label>
            <input
              type="number"
              min="0"
              step="100"
              value={creditLimitUSD}
              onChange={(e) => setCreditLimitUSD(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white font-mono"
            />
          </div>
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
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all disabled:opacity-50"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>Registrar Proveedor</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
