import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getTenantBySlug, getAlertsPageData } from '@/utilities/erpData';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { AlertsView } from '@/components/erp/AlertsView';

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function AlertsPage({ params }: PageProps) {
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

  let data: Awaited<ReturnType<typeof getAlertsPageData>>;
  try {
    data = await getAlertsPageData(tenant.id);
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/${tenantSlug}/erp`}
              className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" />
              Dashboard
            </Link>
            <span className="text-slate-600">/</span>
            <span className="text-xs font-semibold text-indigo-400">Alertas</span>
          </div>
        </div>
      </div>

      <AlertsView
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        active={data.active}
        resolved={data.resolved}
        counts={data.counts}
      />
    </div>
  );
}
