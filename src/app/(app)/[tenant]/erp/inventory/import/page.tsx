import { getTenantBySlug, getWarehousesList } from '@/utilities/erpData';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { ErpAccessError, requireErpTenantAccess } from '@/utilities/erpAuth';
import { InventoryImportView } from '@/components/erp/InventoryImportView';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
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
            <span className="text-xs font-semibold text-indigo-400">Importar Existencias</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Importación Masiva de Inventario</h1>
          <p className="text-xs text-slate-400 mt-1">
            Carga de existencias por Kardex: cada fila genera movimientos de ajuste inmutables dentro de una sola transacción.
          </p>
        </div>
      </div>

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
