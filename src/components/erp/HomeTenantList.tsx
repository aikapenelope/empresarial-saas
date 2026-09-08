'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Building2, ArrowRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
          <p className="text-xs uppercase font-semibold text-muted-foreground tracking-wider">
            Selecciona tu empresa para ingresar al ERP:
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {tenants.map((t) => (
              <Link
                key={t.id}
                href={`/${t.slug}/erp`}
                className="group flex items-center gap-3 px-5 py-3 rounded-xl border border-border bg-card hover:border-muted-foreground/40 text-foreground font-semibold transition-all hover:shadow-lg"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <Building2 className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold">{t.name}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">/{t.slug}/erp</div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all ml-1" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-8 text-center space-y-3">
          <p className="text-sm text-muted-foreground">No hay empresas registradas aún.</p>
        </div>
      )}

      <div className="flex items-center justify-center">
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>Registrar Nueva Empresa</span>
        </Button>
      </div>

      <TenantCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </div>
  );
}
