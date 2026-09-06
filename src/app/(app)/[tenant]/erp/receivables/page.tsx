import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getTenantBySlug, getAccountsReceivableData } from '@/utilities/erpData';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { AccountsReceivableView } from '@/components/erp/AccountsReceivableView';

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function ReceivablesPage({ params }: PageProps) {
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

  let data: Awaited<ReturnType<typeof getAccountsReceivableData>>;
  try {
    data = await getAccountsReceivableData(tenant.id);
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
            <span className="text-xs font-semibold text-indigo-400">Cartera CxC</span>
          </div>
        </div>
      </div>

      <AccountsReceivableView
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        isVendor={data.isVendor}
        vendors={data.vendors}
        rows={data.rows}
        vendorRows={data.vendorRows}
        summary={data.summary}
        asOf={data.asOf}
      />
    </div>
  );
}
