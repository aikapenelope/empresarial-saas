'use client';

import React, { useState } from 'react';
import { Modal } from './Modal';
import { createCustomerAction } from '@/actions/erpActions';
import { Loader2 } from 'lucide-react';

interface CustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: number;
  tenantSlug: string;
}

export function CustomerModal({ isOpen, onClose, tenantId, tenantSlug }: CustomerModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [status, setStatus] = useState<'first_time' | 'recurring' | 'vip' | 'lead'>('first_time');
  const [creditAllowed, setCreditAllowed] = useState(false);
  const [creditLimitUSD, setCreditLimitUSD] = useState(0);
  const [creditDays, setCreditDays] = useState(15);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await createCustomerAction({
      tenantId,
      tenantSlug,
      name,
      taxId,
      phone,
      email,
      address,
      status,
      creditAllowed,
      creditLimitUSD,
      creditDays,
    });

    setLoading(false);

    if (res.success) {
      // Reset
      setName('');
      setTaxId('');
      setPhone('');
      setEmail('');
      setAddress('');
      setCreditAllowed(false);
      onClose();
    } else {
      setError(res.error || 'Error al guardar cliente');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Nuevo Cliente CRM"
      description="Registra un cliente en el padrón del inquilino con condiciones comerciales y WhatsApp de cobranza."
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
            <label className="block font-semibold text-slate-300 mb-1">Razón Social / Nombre *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Inversiones El Trigal, C.A."
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-300 mb-1">RIF / Cédula / Tax ID *</label>
            <input
              type="text"
              required
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              placeholder="Ej. J-12345678-9"
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-300 mb-1">WhatsApp / Teléfono *</label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ej. +584121234567"
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none font-mono"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-300 mb-1">Correo Electrónico</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contacto@empresa.com"
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block font-semibold text-slate-300 mb-1">Dirección Fiscal / Despacho</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Zona Industrial II, Galpón 4"
            className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-300 mb-1">Segmentación CRM</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'first_time')}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="first_time">Cliente Nuevo (Primera vez)</option>
              <option value="recurring">Recurrente / Frecuente</option>
              <option value="vip">VIP / Cuenta Clave</option>
              <option value="lead">Prospecto / Lead</option>
            </select>
          </div>

          <div className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              id="creditAllowed"
              checked={creditAllowed}
              onChange={(e) => setCreditAllowed(e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="creditAllowed" className="font-semibold text-slate-300 cursor-pointer">
              Habilitar Línea de Crédito
            </label>
          </div>
        </div>

        {creditAllowed && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl border border-slate-800 bg-slate-950/60 animate-in fade-in">
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Límite de Crédito (USD)</label>
              <input
                type="number"
                min="0"
                step="50"
                value={creditLimitUSD}
                onChange={(e) => setCreditLimitUSD(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Días de Crédito (Gracia)</label>
              <input
                type="number"
                min="1"
                value={creditDays}
                onChange={(e) => setCreditDays(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white font-mono"
              />
            </div>
          </div>
        )}

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
            <span>Registrar Cliente</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
