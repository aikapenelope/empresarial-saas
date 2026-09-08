import React from 'react';
import { notFound } from 'next/navigation';
import { getTenantBySlug, getDeliveryNotesList } from '@/utilities/erpData';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { DeliveryNotesView } from '@/components/erp/DeliveryNotesView';

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function DeliveryNotesPage({ params }: PageProps) {
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

  let notes;
  try {
    notes = await getDeliveryNotesList(tenant.id);
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  return (
    <div className="space-y-6">

      <DeliveryNotesView tenantId={tenant.id} tenantSlug={tenant.slug} notes={notes} />
    </div>
  );
}
