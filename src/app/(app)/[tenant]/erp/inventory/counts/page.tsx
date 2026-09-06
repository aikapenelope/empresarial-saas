import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import {
  getTenantBySlug,
  getWarehousesList,
  getInventoryCountsList,
} from '@/utilities/erpData';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { CountsView } from '@/components/erp/CountsView';
import type { InventoryCount } from '@/payload-types';

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function InventoryCountsPage({ params }: PageProps) {
  const { tenant: tenantSlug } = await params;
  let tenant: Awaited<ReturnType<typeof getTenantBySlug>> = null;
  try {
    tenant = await getTenantBySlug(tenantSlug);
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  if (!tenant) {
    notFound();
  }

  let counts: InventoryCount[];
  let warehouses: Awaited<ReturnType<typeof getWarehousesList>>;
  try {
    [counts, warehouses] = await Promise.all([
      getInventoryCountsList(tenant.id),
      getWarehousesList(tenant.id),
    ]);
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/${tenantSlug}/erp/inventory`}
              className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" />
              Inventario
            </Link>
            <span className="text-slate-600">/</span>
            <span className="text-xs font-semibold text-indigo-400">Conteos Cíclicos</span>
          </div>
        </div>
      </div>

      <CountsView
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        counts={counts}
        warehouses={warehouses.map((w) => ({ id: w.id, name: w.name, code: w.code }))}
      />
    </div>
  );
}
