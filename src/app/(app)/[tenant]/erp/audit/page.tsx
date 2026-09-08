import React from 'react';
import { notFound } from 'next/navigation';
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
