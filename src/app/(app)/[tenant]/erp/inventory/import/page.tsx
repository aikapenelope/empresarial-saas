import { getTenantBySlug, getWarehousesList } from '@/utilities/erpData';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { ErpAccessError, requireErpTenantAccess } from '@/utilities/erpAuth';
import { InventoryImportView } from '@/components/erp/InventoryImportView';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function InventoryImportPage({ params }: PageProps) {
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

  let warehouses: Awaited<ReturnType<typeof getWarehousesList>>;
  try {
    await requireErpTenantAccess(tenant.id);
    warehouses = await getWarehousesList(tenant.id);
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  return (
    <div className="space-y-6">
      <InventoryImportView
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        warehouses={warehouses.map((w) => ({
          id: w.id,
          name: w.name,
          code: w.code,
          isDefault: w.isDefault,
        }))}
      />
    </div>
  );
}
