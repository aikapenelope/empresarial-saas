'use client';

import React, { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { createCustomerAction, updateCustomerAction } from '@/actions/erpActions';
import { Loader2 } from 'lucide-react';

interface CustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: number;
  tenantSlug: string;
  /** Si se pasa, el modal opera en modo edición sobre ese cliente. */
  initial?: {
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
  } | null;
}

export function CustomerModal({ isOpen, onClose, tenantId, tenantSlug, initial }: CustomerModalProps) {
  const isEdit = Boolean(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initial?.name || '');
  const [taxId, setTaxId] = useState(initial?.taxId || '');
  const [phone, setPhone] = useState(initial?.phone || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [address, setAddress] = useState(initial?.address || '');
  const [status, setStatus] = useState<'first_time' | 'recurring' | 'vip' | 'lead'>(
    (initial?.status as 'recurring') || 'first_time',
  );
  const [creditAllowed, setCreditAllowed] = useState(Boolean(initial?.creditAllowed));
  const [creditLimitUSD, setCreditLimitUSD] = useState(Number(initial?.creditLimitUSD) || 0);
  const [creditDays, setCreditDays] = useState(initial?.creditDays == null ? 15 : Number(initial.creditDays));
  const [priceTier, setPriceTier] = useState<'retail' | 'wholesale' | 'vendor' | 'promo'>(
    (initial?.priceTier as 'retail') || 'retail',
  );

  // Sincroniza SIEMPRE los campos con `initial`: al montar, al abrir y cuando
  // cambia el registro seleccionado. Con initial null (modo creación) restaura
  // los defaults para que un "Nuevo" no herede valores de una edición previa.
  useEffect(() => {
    if (initial) {
      setName(initial.name || '');
      setTaxId(initial.taxId || '');
      setPhone(initial.phone || '');
      setEmail(initial.email || '');
      setAddress(initial.address || '');
      setStatus((initial.status as 'recurring') || 'first_time');
      setCreditAllowed(Boolean(initial.creditAllowed));
      setCreditLimitUSD(Number(initial.creditLimitUSD) || 0);
      setCreditDays(initial.creditDays == null ? 15 : Number(initial.creditDays));
      setPriceTier((initial.priceTier as 'retail') || 'retail');
    } else {
      setName('');
      setTaxId('');
      setPhone('');
      setEmail('');
      setAddress('');
      setStatus('first_time');
      setCreditAllowed(false);
      setCreditLimitUSD(0);
      setCreditDays(15);
      setPriceTier('retail');
    }
  }, [initial, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = isEdit
      ? await updateCustomerAction({
          tenantId,
          tenantSlug,
          customerId: initial!.id,
          name,
          taxId,
          phone,
          // Edición: vaciar el campo envía null (limpia); no undefined.
          email: email.trim() === '' ? null : email,
          address: address.trim() === '' ? null : address,
          status,
          creditAllowed,
          creditLimitUSD,
          creditDays,
          priceTier,
        })
      : await createCustomerAction({
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
      if (!isEdit) {
        // Reset solo en creación
        setName('');
        setTaxId('');
        setPhone('');
        setEmail('');
        setAddress('');
        setCreditAllowed(false);
      }
      onClose();
    } else {
      setError(res.error || 'Error al guardar cliente');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? `Editar Cliente — ${initial!.name}` : 'Nuevo Cliente CRM'}
      description={
        isEdit
          ? 'Actualiza los datos comerciales, condiciones de crédito y tier de precios del cliente.'
          : 'Registra un cliente en el padrón del inquilino con condiciones comerciales y WhatsApp de cobranza.'
      }
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-300 mb-1">Tier de Precio</label>
            <select
              value={priceTier}
              onChange={(e) => setPriceTier(e.target.value as 'retail')}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="retail">Retail (detal)</option>
              <option value="wholesale">Wholesale (mayorista)</option>
              <option value="vendor">Vendor (vendedor)</option>
              <option value="promo">Promo (promoción)</option>
            </select>
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
            <span>{isEdit ? 'Guardar Cambios' : 'Registrar Cliente'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
