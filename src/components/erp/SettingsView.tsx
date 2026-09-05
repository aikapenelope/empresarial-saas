'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { updateTenantSettingsAction } from '@/actions/erpActions';
import { formatVES } from './KpiCard';
import { ArrowLeft, Building2, Coins, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';

interface SettingsViewProps {
  tenant: {
    id: number;
    name: string;
    slug: string;
    rifFiscal?: string | null;
    phone?: string | null;
    currencyConfig?: {
      baseCurrency?: ('USD' | 'VES') | null;
      manualExchangeRate?: number | null;
      autoSyncRate?: boolean | null;
    } | null;
  };
  effectiveRate: number;
  bcvRate: number | null;
  rateSource: string;
}

export function SettingsView({
  tenant,
  effectiveRate,
  bcvRate,
  rateSource,
}: SettingsViewProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [name, setName] = useState(tenant.name || '');
  const [rifFiscal, setRifFiscal] = useState(tenant.rifFiscal || '');
  const [phone, setPhone] = useState(tenant.phone || '');
  const [baseCurrency, setBaseCurrency] = useState<'USD' | 'VES'>(
    tenant.currencyConfig?.baseCurrency || 'USD',
  );
  const [autoSyncRate, setAutoSyncRate] = useState<boolean>(
    tenant.currencyConfig?.autoSyncRate ?? true,
  );
  const [manualExchangeRate, setManualExchangeRate] = useState<number>(
    tenant.currencyConfig?.manualExchangeRate || 0,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const res = await updateTenantSettingsAction({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      name,
      rifFiscal,
      phone,
      baseCurrency,
      manualExchangeRate,
      autoSyncRate,
    });

    setLoading(false);

    if (res.success) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } else {
      setError(res.error || 'Error al actualizar configuración');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/${tenant.slug}/erp`}
              className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" />
              Dashboard
            </Link>
            <span className="text-slate-600">/</span>
            <span className="text-xs font-semibold text-indigo-400">Configuración</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Ajustes de Empresa & Parámetros Bimonetarios
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Personaliza los datos fiscales, WhatsApp de cobranzas y la política de tasa de cambio de tu organización.
          </p>
        </div>
      </div>

      {success && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-emerald-400 text-xs font-semibold animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>¡Configuración de la empresa guardada y aplicada exitosamente!</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-4 text-rose-300 text-xs">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 text-xs">
        {/* Sección 1: Datos Fiscales y de Contacto */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-5 backdrop-blur space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800/80 pb-3">
            <Building2 className="h-4 w-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-white">Identificación Fiscal & Corporativa</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Razón Social / Nombre Comercial *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">RIF / Cédula Fiscal</label>
              <input
                type="text"
                value={rifFiscal}
                onChange={(e) => setRifFiscal(e.target.value)}
                placeholder="Ej. J-12345678-0"
                className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white font-mono focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-300 mb-1">
                WhatsApp Oficial de Cobranzas / Teléfono
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ej. +584121234567"
                className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white font-mono focus:border-indigo-500 focus:outline-none"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Utilizado para generar los enlaces de cobro automático con mensajes estructurados.
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">Identificador URL (Slug)</label>
              <input
                type="text"
                disabled
                value={tenant.slug}
                className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-slate-400 font-mono cursor-not-allowed"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Identificador permanente del inquilino multi-tenant.
              </p>
            </div>
          </div>
        </div>

        {/* Sección 2: Configuración Bimonetaria y Tasa */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-5 backdrop-blur space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800/80 pb-3">
            <Coins className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-white">Política Cambiaria & Moneda Base</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Moneda Base Contable</label>
              <select
                value={baseCurrency}
                onChange={(e) => setBaseCurrency(e.target.value as 'USD' | 'VES')}
                className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="USD">Dólar Estadounidense (USD $)</option>
                <option value="VES">Bolívar Soberano (VES Bs.)</option>
              </select>
              <p className="text-[10px] text-slate-500 mt-1">
                Moneda de consolidación de balances deudores y métricas financieras.
              </p>
            </div>

            <div className="flex flex-col justify-center space-y-2 pt-1">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="autoSyncRate"
                  checked={autoSyncRate}
                  onChange={(e) => setAutoSyncRate(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="autoSyncRate" className="font-semibold text-slate-300 cursor-pointer">
                  Sincronizar automáticamente con Tasa Oficial BCV
                </label>
              </div>
              <p className="text-[10px] text-slate-500 pl-6">
                Si está activo, las operaciones calcularán el contravalor con el valor oficial del Banco Central de Venezuela.
              </p>
            </div>
          </div>

          {/* Tarjeta de Tasa Actual */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400 uppercase font-semibold">Tasa Efectiva en Operaciones</span>
                <div className="font-mono font-bold text-lg text-emerald-400">
                  {formatVES(effectiveRate)}
                </div>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-slate-400 uppercase font-semibold">Fuente Activa</span>
                <div className="font-mono text-xs text-indigo-400 capitalize">
                  {rateSource === 'auto_bcv'
                    ? `BCV Oficial (${bcvRate ? formatVES(bcvRate) : 'En Vivo'})`
                    : 'Tasa Manual de la Empresa'}
                </div>
              </div>
            </div>

            {!autoSyncRate && (
              <div className="pt-3 border-t border-slate-800">
                <label className="block font-semibold text-slate-300 mb-1">
                  Tasa de Cambio Manual de la Empresa (Bs. por 1 USD)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={manualExchangeRate}
                  onChange={(e) => setManualExchangeRate(Number(e.target.value))}
                  placeholder="Ej. 65.40"
                  className="w-full sm:w-64 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white font-mono focus:border-indigo-500 focus:outline-none"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Aplica para facturación y cobros cuando la sincronización automática del BCV está inactiva.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Botón Guardar */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <Link
            href={`/${tenant.slug}/erp`}
            className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 font-semibold"
          >
            Volver al Dashboard
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Guardando Cambios...</span>
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                <span>Guardar Configuración</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
