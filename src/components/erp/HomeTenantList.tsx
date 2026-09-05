'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Building2, ArrowRight, Plus } from 'lucide-react';
import { TenantCreateModal } from './modals/TenantCreateModal';
import type { Tenant } from '@/payload-types';

interface HomeTenantListProps {
  tenants: Tenant[];
}

export function HomeTenantList({ tenants }: HomeTenantListProps) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  return (
    <div className="pt-6 space-y-6">
      {tenants.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
            Selecciona tu empresa para ingresar al ERP:
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {tenants.map((t) => (
              <Link
                key={t.id}
                href={`/${t.slug}/erp`}
                className="group flex items-center gap-3 px-5 py-3 rounded-xl border border-slate-800 bg-slate-900/80 hover:border-indigo-500/40 hover:bg-slate-900 text-white font-semibold transition-all shadow-lg hover:shadow-indigo-500/10"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600/20 text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <Building2 className="h-4 w-4" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold">{t.name}</div>
                  <div className="text-[10px] text-slate-400 font-mono">/{t.slug}/erp</div>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-white group-hover:translate-x-0.5 transition-all ml-1" />
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-8 text-center space-y-3">
          <p className="text-sm text-slate-400">No hay empresas registradas aún.</p>
        </div>
      )}

      <div className="flex items-center justify-center">
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all shadow-lg shadow-indigo-600/25"
        >
          <Plus className="h-4 w-4" />
          <span>+ Registrar Nueva Empresa</span>
        </button>
      </div>

      <TenantCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </div>
  );
}
