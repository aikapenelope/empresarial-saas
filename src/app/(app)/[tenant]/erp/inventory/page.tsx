import React from 'react';
import { notFound } from 'next/navigation';
import {
  getTenantBySlug,
  getProductsCatalog,
  getBillOfMaterialsList,
  getWarehousesList,
} from '@/utilities/erpData';
import { InventoryView } from '@/components/erp/InventoryView';
import { ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function InventoryPage({ params }: PageProps) {
  const { tenant: tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);

  if (!tenant) {
    notFound();
  }

  let products, boms, warehouses;
  try {
    [products, boms, warehouses] = await Promise.all([
      getProductsCatalog(tenant.id),
      getBillOfMaterialsList(tenant.id),
      getWarehousesList(tenant.id),
    ]);
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  let rawMaterialsCount = 0;
  let manufacturedCount = 0;
  let criticalCount = 0;

  for (const p of products) {
    if (p.productType === 'raw_material') rawMaterialsCount++;
    if (p.productType === 'manufactured') manufacturedCount++;
    const min = Number(p.minStockAlert) || 0;
    const current = Number(p.currentStock) || 0;
    if (min > 0 && current <= min) criticalCount++;
  }

  return (
    <InventoryView
      tenantId={tenant.id}
      tenantSlug={tenant.slug}
      products={products}
      boms={boms}
      warehouses={warehouses}
      rawMaterialsCount={rawMaterialsCount}
      manufacturedCount={manufacturedCount}
      lowStockCount={criticalCount}
    />
  );
}
