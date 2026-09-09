'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from './Modal';
import { createTenantAction } from '@/actions/erpActions';
import { Loader2 } from 'lucide-react';

interface TenantCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TenantCreateModal({ isOpen, onClose }: TenantCreateModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [rifFiscal, setRifFiscal] = useState('');
  const [phone, setPhone] = useState('');

  const handleNameChange = (val: string) => {
    setName(val);
    // Auto generar slug si el usuario no lo ha personalizado
    const autoSlug = val
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    setSlug(autoSlug);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) {
      setError('El nombre y el slug de la empresa son obligatorios.');
      return;
    }

    setLoading(true);
    setError(null);

    const res = await createTenantAction({
      name,
      slug,
      rifFiscal: rifFiscal || undefined,
      phone: phone || undefined,
    });

    setLoading(false);

    if (res.success && res.data) {
      onClose();
      router.push(`/${res.data.slug}/erp`);
      router.refresh();
    } else {
      setError(res.error || 'Error al crear empresa');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Crear Nueva Empresa (Inquilino)"
      description="Crea un espacio de trabajo aislado con su propio catálogo, clientes, inventario y cuentas por cobrar."
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-rose-300">
            {error}
          </div>
        )}

        <div>
          <label className="block font-semibold text-foreground mb-1">Nombre de la Empresa *</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Ej. Comercializadora Los Andes, C.A."
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
          />
        </div>

        <div>
          <label className="block font-semibold text-foreground mb-1">Identificador URL (Slug) *</label>
          <input
            type="text"
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
            placeholder="ej. los-andes"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none font-mono"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Se accederá al ERP en: <span className="text-indigo-400 font-mono">/{slug || 'tu-empresa'}/erp</span>
          </p>
        </div>

        <div>
          <label className="block font-semibold text-foreground mb-1">RIF / Cédula Fiscal</label>
          <input
            type="text"
            value={rifFiscal}
            onChange={(e) => setRifFiscal(e.target.value)}
            placeholder="Ej. J-12345678-0"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none font-mono"
          />
        </div>

        <div>
          <label className="block font-semibold text-foreground mb-1">Teléfono / WhatsApp Corporativo</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Ej. +584121234567"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none font-mono"
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
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all disabled:opacity-50"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>Crear Empresa & Entrar</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
