import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getTenantBySlug, getAuditLogData } from '@/utilities/erpData';
import { auditFiltersSchema } from '@/utilities/erpValidation';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { AuditView } from '@/components/erp/AuditView';

interface PageProps {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{
    page?: string;
    collection?: string;
    operation?: string;
    from?: string;
    to?: string;
  }>;
}

export default async function AuditPage({ params, searchParams }: PageProps) {
  const { tenant: tenantSlug } = await params;
  const sp = await searchParams;
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

  // Filtros validados con Zod (mismo criterio del kardex): los valores
  // malformados se descartan en lugar de romper la página.
  const q = auditFiltersSchema.parse(sp);
  let data: Awaited<ReturnType<typeof getAuditLogData>>;
  try {
    data = await getAuditLogData(tenant.id, {
      page: q.page,
      collection: q.collection,
      operation: q.operation,
      from: q.from,
      to: q.to,
    });
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
            <span className="text-xs font-semibold text-indigo-400">Auditoría</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Auditoría Global</h1>
          <p className="text-xs text-slate-400 mt-1">
            Trazabilidad inmutable de creaciones, actualizaciones y eliminaciones en las colecciones críticas.
          </p>
        </div>
      </div>

      <AuditView
        tenantSlug={tenantSlug}
        entries={data.auditEntries}
        totalDocs={data.totalDocs}
        page={data.page}
        totalPages={data.totalPages}
        filters={{ collection: q.collection, operation: q.operation, from: q.from, to: q.to }}
      />
    </div>
  );
}
